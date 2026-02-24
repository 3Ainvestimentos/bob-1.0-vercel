"""
Serviço de processamento ultra batch para relatórios XP.
Escrita no Sheets: função sync em run_in_executor sem await (fire-and-forget);
buffer por job (50 linhas ou 2s) para não saturar o thread pool.
"""
import asyncio
import base64
import gc
import json
import time
from collections import defaultdict
from typing import AsyncGenerator

from firebase_admin import firestore

from app.config import get_firestore_client, get_firebase_bucket
from app.services.report_analyzer.batch_processing import process_batch_reports
from app.services.report_analyzer.google_sheets_service import (
    batch_flush_rows_to_sheets_sync,
    write_ultra_batch_result_to_sheets_sync,
)
from app.services.metrics import record_ultra_batch_complete

SHEETS_BUFFER_SIZE = 50
SHEETS_BUFFER_SECONDS = 2.0

async def read_file_from_gcs(storage_path: str) -> bytes:
    """
    Lê arquivo diretamente do GCS sem download HTTP.
    Usa Service Account para autenticação.
    
    Args:
        storage_path: Caminho do arquivo no GCS (ex: "ultra-batch/batch_id/file.pdf")
    
    Returns:
        Bytes do arquivo
    
    Raises:
        Exception: Se o arquivo não existir ou houver erro na leitura
    """
    try:
        print(f"[GCS-READ] Lendo arquivo do GCS: {storage_path}")
        
        # Obter bucket usando função existente em config.py
        bucket = get_firebase_bucket()
        
        # Criar referência ao blob
        blob = bucket.blob(storage_path)
        
        # Verificar se o arquivo existe
        if not blob.exists():
            raise Exception(f"Arquivo não encontrado no GCS: {storage_path}")
        
        # Ler bytes diretamente do GCS
        file_bytes = blob.download_as_bytes()
        
        print(f"[GCS-READ] ✅ Arquivo lido: {len(file_bytes)} bytes")
        return file_bytes
        
    except Exception as e:
        print(f"[GCS-READ] ❌ Erro ao ler {storage_path}: {e}")
        raise Exception(f"Erro ao ler arquivo do GCS {storage_path}: {str(e)}")

async def process_ultra_batch_reports(batch_id: str, user_id: str, job_id: str) -> AsyncGenerator[str, None]:
    """
    Processa múltiplos relatórios em chunks de 5 (ultra batch) e emite eventos SSE.
    
    Agora é um AsyncGenerator que faz yield de eventos SSE ("data: {...}\n\n").
    
    Args:
        batch_id: ID do batch (arquivos já estão no GCS)
        user_id: ID do usuário
        job_id: ID do job no Firestore
    
    Yields:
        str: Eventos SSE
    """
    print(f"[ULTRA-BATCH] Iniciando processamento STREAM para job {job_id}, batch {batch_id}")
    start_time = time.time()
    loop = asyncio.get_running_loop()
    sheets_buffer: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    sheets_last_flush: dict[str, float] = {job_id: time.monotonic()}

    def flush_sheets_buffer(jid: str, force: bool = False) -> None:
        buf = sheets_buffer.get(jid, [])
        if not buf:
            return
        if not force and len(buf) < SHEETS_BUFFER_SIZE:
            if jid in sheets_last_flush and (time.monotonic() - sheets_last_flush[jid]) < SHEETS_BUFFER_SECONDS:
                return
        rows = buf.copy()
        sheets_buffer[jid] = []
        sheets_last_flush[jid] = time.monotonic()
        loop.run_in_executor(None, batch_flush_rows_to_sheets_sync, jid, rows)

    storage_paths_to_delete: list[str] = []
    
    try:
        # 1. Obter cliente Firestore
        db = get_firestore_client()
        job_ref = db.collection('ultra_batch_jobs').document(job_id)
        
        # 2. Buscar metadados do batch no Firestore
        batch_ref = db.collection('ultra_batch_uploads').document(batch_id)
        batch_doc = batch_ref.get()
        
        if not batch_doc.exists:
            raise Exception(f"Batch {batch_id} não encontrado no Firestore")
        
        batch_data = batch_doc.to_dict()
        file_names = batch_data.get('file_names', [])
        storage_paths = batch_data.get('storage_paths', [])
        
        print(f"[ULTRA-BATCH] Batch encontrado: {len(file_names)} arquivos")
        
        # Emitir evento de início
        yield f"data: {json.dumps({
            'event': 'started',
            'job_id': job_id,
            'total_files': len(file_names),
            'estimated_time_minutes': len(file_names) * 2
        })}\n\n"
        
        # Coletar storage_paths para limpeza (independente de sucesso/falha)
        storage_paths_to_delete = storage_paths.copy()
        
        # =========================================================================================
        # ✅ ESTRATÉGIA: STREAMING / LEITURA PREGUIÇOSA (LAZY LOADING)
        # Em vez de ler tudo para a memória, dividimos os CAMINHOS em chunks e lemos sob demanda.
        # =========================================================================================
        
        # Combinar caminhos e nomes para iterar juntos
        all_files_metadata = list(zip(storage_paths, file_names))
        
        chunk_size = 5
        # Dividir a LISTA DE METADADOS em chunks (não os arquivos em si)
        metadata_chunks = [all_files_metadata[i:i + chunk_size] for i in range(0, len(all_files_metadata), chunk_size)]
        total_chunks = len(metadata_chunks)
        
        print(f"[ULTRA-BATCH] Dividido em {total_chunks} chunks de metadados")
        
        yield f"data: {json.dumps({
            'event': 'chunks_prepared',
            'total_chunks': total_chunks
        })}\n\n"
        
        # Inicializar contadores globais
        processed_files = 0
        success_count = 0
        failure_count = 0
        
        # Função auxiliar para ler arquivo e tratar erro individualmente
        async def read_and_convert_file(storage_path: str, file_name: str) -> dict:
            try:
                # Ler bytes do GCS (agora acontece dentro do loop do chunk)
                file_bytes = await read_file_from_gcs(storage_path)
                
                # Converter bytes para base64
                file_base64 = base64.b64encode(file_bytes).decode('utf-8')
                
                return {
                    "name": file_name,
                    "dataUri": file_base64
                }
            except Exception as e:
                print(f"[ULTRA-BATCH] ❌ Erro ao ler {file_name} do GCS: {e}")
                return {
                    "name": file_name,
                    "dataUri": None,
                    "error": str(e)
                }

        # Loop principal de processamento
        for chunk_index, metadata_chunk in enumerate(metadata_chunks):
            print(f"[ULTRA-BATCH] 🔄 Iniciando Chunk {chunk_index + 1}/{total_chunks} ({len(metadata_chunk)} arquivos)")
            
            # Emitir keep-alive antes de operação pesada
            yield ": keepalive\n\n"
            
            # 1. Ler arquivos DESTE chunk do GCS
            # Isso garante que só temos 5 arquivos na memória RAM por vez.
            read_tasks = [
                read_and_convert_file(path, name)
                for path, name in metadata_chunk
            ]
            
            # Carregar arquivos do chunk atual para a memória
            chunk_files_data = await asyncio.gather(*read_tasks)
            
            # Separar arquivos válidos e com erro de leitura
            files_to_process = []
            files_with_read_errors = []
            
            for f in chunk_files_data:
                if f.get("error"):
                    files_with_read_errors.append(f)
                else:
                    files_to_process.append(f)
            
            print(f"[ULTRA-BATCH] Chunk carregado: {len(files_to_process)} prontos, {len(files_with_read_errors)} erros de leitura")
            
            # 2. Processar erros de leitura imediatamente
            current_chunk_offset = chunk_index * chunk_size
            
            for error_file in files_with_read_errors:
                # Encontrar o índice original global desse arquivo
                relative_index = -1
                for idx, (p, n) in enumerate(metadata_chunk):
                    if n == error_file["name"]:
                        relative_index = idx
                        break
                
                if relative_index != -1:
                    global_file_index = current_chunk_offset + relative_index
                    
                    error_msg = f"Erro de leitura: {error_file.get('error')}"
                    
                    result_ref = job_ref.collection('results').document(str(global_file_index))
                    result_ref.set({
                        "fileName": error_file["name"],
                        "accountNumber": "",
                        "success": False,
                        "final_message": None,
                        "error": error_msg,
                        "processedAt": firestore.SERVER_TIMESTAMP,
                        "processedAt_epoch_ms": int(time.time() * 1000),
                    })
                    
                    processed_files += 1
                    failure_count += 1
                    
                    # Emitir evento de erro
                    yield f"data: {json.dumps({
                        'event': 'file_error',
                        'index': global_file_index,
                        'fileName': error_file['name'],
                        'error': error_msg,
                        'total': len(file_names)
                    })}\n\n"

            # 3. Processar arquivos válidos com a IA (batch_processing)
            if files_to_process:
                try:
                    # Emitir keep-alive antes de chamar a IA
                    yield ": keepalive\n\n"
                    
                    # Chama o processamento (que agora tem Semáforo global)
                    # Nota: Como chunk_size (5) < MAX_CONCURRENT (10), isso roda livre.
                    ia_results = await process_batch_reports(files_to_process, user_id)
                    
                    # Salvar resultados da IA
                    for result in ia_results:
                        # Encontrar índice global
                        file_name = result.get("file_name")
                        relative_index = -1
                        for idx, (p, n) in enumerate(metadata_chunk):
                            if n == file_name:
                                relative_index = idx
                                break
                        
                        # Fallback se não achar nome (improvável)
                        if relative_index == -1:
                            print(f"[ULTRA-BATCH] ⚠️ Nome de arquivo não encontrado no metadado: {file_name}")
                            continue
                            
                        global_file_index = current_chunk_offset + relative_index
                        
                        processed_at_epoch_ms = int(time.time() * 1000)
                        result_data = {
                            "fileName": file_name,
                            "success": result.get("success", False),
                            "processedAt": firestore.SERVER_TIMESTAMP,
                            "processedAt_epoch_ms": processed_at_epoch_ms,
                        }
                        
                        if result.get("success"):
                            result_data["final_message"] = result.get("data", {}).get("final_message")
                            result_data["error"] = None

                            extracted_data = result.get("data", {}).get("extracted_data")
                            account_number = ""
                            if extracted_data and isinstance(extracted_data, dict):
                                account_number = extracted_data.get("accountNumber", "")
                            result_data["accountNumber"] = account_number

                            success_count += 1

                            if account_number and result_data.get("final_message"):
                                sheets_buffer[job_id].append(
                                    (account_number, result_data["final_message"], processed_at_epoch_ms)
                                )
                                flush_sheets_buffer(
                                    job_id,
                                    force=(len(sheets_buffer[job_id]) >= SHEETS_BUFFER_SIZE),
                                )

                            yield f"data: {json.dumps({
                                'event': 'file_completed',
                                'index': global_file_index,
                                'fileName': file_name,
                                'success': True,
                                'result': {
                                    'fileName': file_name,
                                    'finalMessage': result_data["final_message"],
                                    'success': True
                                },
                                'total': len(file_names)
                            })}\n\n"
                            
                        else:
                            result_data["final_message"] = None
                            result_data["error"] = result.get("error", "Erro desconhecido")
                            failure_count += 1
                            
                            # Emitir evento de erro
                            yield f"data: {json.dumps({
                                'event': 'file_error',
                                'index': global_file_index,
                                'fileName': file_name,
                                'error': result_data["error"],
                                'total': len(file_names)
                            })}\n\n"
                        
                        # Salvar no Firestore (persistência em background, não bloqueante na teoria, mas aqui é síncrono da lib)
                        # Como é rápido, mantemos.
                        result_ref = job_ref.collection('results').document(str(global_file_index))
                        result_ref.set(result_data)
                        
                        processed_files += 1
                        
                except Exception as ia_error:
                    print(f"[ULTRA-BATCH] ❌ Erro crítico no processamento do chunk: {ia_error}")
                    # Se falhar o process_batch_reports inteiro, marcar todos os files_to_process como erro
                    for f in files_to_process:
                        file_name = f["name"]
                        relative_index = -1
                        for idx, (p, n) in enumerate(metadata_chunk):
                            if n == file_name:
                                relative_index = idx
                                break
                        
                        if relative_index != -1:
                            global_file_index = current_chunk_offset + relative_index
                            
                            error_msg = f"Erro IA: {str(ia_error)}"
                            
                            result_ref = job_ref.collection('results').document(str(global_file_index))
                            result_ref.set({
                                "fileName": file_name,
                                "accountNumber": "",
                                "success": False,
                                "error": error_msg,
                                "processedAt": firestore.SERVER_TIMESTAMP,
                                "processedAt_epoch_ms": int(time.time() * 1000),
                            })
                            processed_files += 1
                            failure_count += 1
                            
                            yield f"data: {json.dumps({
                                'event': 'file_error',
                                'index': global_file_index,
                                'fileName': file_name,
                                'error': error_msg,
                                'total': len(file_names)
                            })}\n\n"

            # 4. Atualizar progresso global no job
            job_ref.update({
                "processedFiles": processed_files,
                "successCount": success_count,
                "failureCount": failure_count
            })
            
            print(f"[ULTRA-BATCH] Chunk {chunk_index + 1} concluído. Memória liberada.")
            
            # LIBERAÇÃO EXPLÍCITA DE MEMÓRIA
            del chunk_files_data
            del files_to_process
            del files_with_read_errors
            gc.collect()

            # Pequeno sleep para garantir yield ao loop de eventos e GC
            await asyncio.sleep(0.1)

        # =========================================================================================
        # FIM DO LOOP DE CHUNKS - PROCESSO DE CONCLUSÃO NORMAL
        # =========================================================================================

        flush_sheets_buffer(job_id, force=True)

        # 6. Marcar job como concluído
        job_ref.update({
            "status": "completed",
            "completedAt": firestore.SERVER_TIMESTAMP
        })
        
        # 7. 🔗 PADRÃO DE PONTEIRO: Atualizar statusJob no chat (se houver chat_id)
        try:
            job_doc = job_ref.get()
            if job_doc.exists:
                job_data = job_doc.to_dict()
                chat_id = job_data.get('chat_id')
                if chat_id:
                    user_id_from_job = job_data.get('user_id')
                    chat_ref = db.collection('users').document(user_id_from_job).collection('chats').document(chat_id)
                    chat_ref.update({'statusJob': 'completed'})
                    print(f"[ULTRA-BATCH] ✅ Status do chat {chat_id} atualizado para 'completed'")
        except Exception as update_error:
            print(f"[ULTRA-BATCH] ⚠️ Erro ao atualizar status do chat: {update_error}")
        
        print(f"[ULTRA-BATCH] ✅ Job {job_id} concluído! {success_count} sucessos, {failure_count} falhas")
        
        duration = time.time() - start_time
        
        # Registrar conclusão de ultra-batch
        try:
            record_ultra_batch_complete(user_id, job_id)
        except Exception as e:
            print(f"[ULTRA-BATCH] ⚠️ Erro ao registrar conclusão de métrica: {e}")
            
        # Emitir evento final
        yield f"data: {json.dumps({
            'event': 'completed',
            'job_id': job_id,
            'success_count': success_count,
            'failure_count': failure_count,
            'duration_seconds': duration
        })}\n\n"
        
    except Exception as e:
        print(f"[ULTRA-BATCH] ❌ Erro crítico no job {job_id}: {e}")
        
        # Marcar job como falhado
        try:
            job_ref = db.collection('ultra_batch_jobs').document(job_id)
            job_ref.update({
                "status": "failed",
                "error": str(e),
                "completedAt": firestore.SERVER_TIMESTAMP
            })
            
            # 🔗 PADRÃO DE PONTEIRO
            try:
                job_doc = job_ref.get()
                if job_doc.exists:
                    job_data = job_doc.to_dict()
                    chat_id = job_data.get('chat_id')
                    if chat_id:
                        user_id_from_job = job_data.get('user_id')
                        chat_ref = db.collection('users').document(user_id_from_job).collection('chats').document(chat_id)
                        chat_ref.update({'statusJob': 'failed'})
            except Exception:
                pass
        except:
            print(f"[ULTRA-BATCH] Não foi possível atualizar status de erro no Firestore")
        
        # Emitir evento de erro fatal
        yield f"data: {json.dumps({
            'event': 'fatal_error',
            'error': str(e)
        })}\n\n"
    
    finally:
        # 8. LIMPEZA: Deletar arquivos do GCS após processamento (sucesso ou falha)
        if storage_paths_to_delete:
            print(f"[CLEANUP] Iniciando limpeza de {len(storage_paths_to_delete)} arquivos do GCS...")
            try:
                bucket = get_firebase_bucket()
                deleted_count = 0
                for storage_path in storage_paths_to_delete:
                    try:
                        blob = bucket.blob(storage_path)
                        if blob.exists():
                            blob.delete()
                            deleted_count += 1
                            print(f"[CLEANUP] ✅ Arquivo deletado: {storage_path}")
                        else:
                            print(f"[CLEANUP] ⚠️ Arquivo não encontrado (já deletado?): {storage_path}")
                    except Exception as delete_error:
                        print(f"[CLEANUP] ⚠️ Falha ao deletar {storage_path}: {delete_error}")
                        # Não falhar o job se limpeza falhar
                
                print(f"[CLEANUP] ✅ Limpeza concluída: {deleted_count}/{len(storage_paths_to_delete)} arquivos deletados")
                
                # Atualizar status do batch no Firestore
                try:
                    batch_ref = db.collection('ultra_batch_uploads').document(batch_id)
                    batch_ref.update({
                        'status': 'completed',
                        'cleaned_at': firestore.SERVER_TIMESTAMP
                    })
                except Exception as update_error:
                    print(f"[CLEANUP] ⚠️ Erro ao atualizar status do batch: {update_error}")
                    
            except Exception as cleanup_error:
                print(f"[CLEANUP] ❌ Erro crítico na limpeza: {cleanup_error}")
