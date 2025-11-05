"""
Serviço de processamento ultra batch para relatórios XP.
"""
import asyncio
import base64  # ← NOVO: para converter bytes em base64
from firebase_admin import firestore
from app.config import get_firestore_client, get_firebase_bucket  # ← MODIFICAR: adicionar get_firebase_bucket
from app.services.report_analyzer.batch_processing import process_batch_reports

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

async def process_ultra_batch_reports(batch_id: str, user_id: str, job_id: str):
    """
    Processa múltiplos relatórios em chunks de 5 (ultra batch).
    
    Agora recebe batch_id e lê arquivos diretamente do GCS.
    
    Args:
        batch_id: ID do batch (arquivos já estão no GCS)
        user_id: ID do usuário
        job_id: ID do job no Firestore
    
    Returns:
        None (resultados são salvos no Firestore)
    """
    print(f"[ULTRA-BATCH] Iniciando processamento para job {job_id}, batch {batch_id}")
    
    # Lista para coletar storage_paths para limpeza
    storage_paths_to_delete = []
    
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
        
        # Coletar storage_paths para limpeza (independente de sucesso/falha)
        storage_paths_to_delete = storage_paths.copy()
        
        # 3. Ler todos os arquivos do GCS em paralelo e converter para base64
        print(f"[ULTRA-BATCH] Lendo {len(storage_paths)} arquivos do GCS...")
        
        async def read_and_convert_file(storage_path: str, file_name: str) -> dict:
            """Lê arquivo do GCS e converte para formato compatível com process_batch_reports"""
            try:
                # Ler bytes do GCS
                file_bytes = await read_file_from_gcs(storage_path)
                
                # Converter bytes para base64 (formato esperado por process_batch_reports)
                file_base64 = base64.b64encode(file_bytes).decode('utf-8')
                
                return {
                    "name": file_name,
                    "dataUri": file_base64
                }
            except Exception as e:
                print(f"[ULTRA-BATCH] ❌ Erro ao ler {file_name} do GCS: {e}")
                # Retornar objeto de erro para ser processado
                return {
                    "name": file_name,
                    "dataUri": None,
                    "error": str(e)
                }
        
        # Ler todos os arquivos em paralelo
        read_tasks = [
            read_and_convert_file(storage_path, file_name)
            for storage_path, file_name in zip(storage_paths, file_names)
        ]
        
        files_data = await asyncio.gather(*read_tasks)
        
        # Filtrar arquivos que falharam na leitura
        files_with_errors = [f for f in files_data if f.get("error")]
        files_to_process = [f for f in files_data if not f.get("error")]
        
        # Marcar arquivos com erro como falha no Firestore
        for error_file in files_with_errors:
            error_index = file_names.index(error_file["name"])
            result_ref = job_ref.collection('results').document(str(error_index))
            result_ref.set({
                "fileName": error_file["name"],
                "success": False,
                "final_message": None,
                "error": f"Erro ao ler arquivo do GCS: {error_file.get('error')}",
                "processedAt": firestore.SERVER_TIMESTAMP
            })
        
        if not files_to_process:
            raise Exception("Nenhum arquivo foi lido com sucesso do GCS")
        
        print(f"[ULTRA-BATCH] ✅ {len(files_to_process)} arquivos lidos do GCS, {len(files_with_errors)} erros")
        
        # 4. Dividir arquivos em chunks de 5 (MESMA LÓGICA DE ANTES)
        chunk_size = 5
        chunks = [files_to_process[i:i + chunk_size] for i in range(0, len(files_to_process), chunk_size)]
        total_chunks = len(chunks)
        
        print(f"[ULTRA-BATCH] Dividido em {total_chunks} chunks de até {chunk_size} arquivos")
        
        # Inicializar contadores
        processed_files = len(files_with_errors)  # Contar arquivos com erro já processados
        success_count = 0
        failure_count = len(files_with_errors)
        
        # 5. Processar cada chunk sequencialmente (MESMA LÓGICA DE ANTES)
        for chunk_index, chunk in enumerate(chunks):
            print(f"[ULTRA-BATCH] Processando chunk {chunk_index + 1}/{total_chunks} com {len(chunk)} arquivos")
            
            try:
                # Reutilizar função de batch existente (MESMA LÓGICA DE ANTES)
                chunk_results = await process_batch_reports(chunk, user_id)
                
                # Calcular offset para índices globais (considerando arquivos com erro)
                offset = len(files_with_errors) + (chunk_index * chunk_size)
                
                # Salvar resultados no Firestore
                for result_index, result in enumerate(chunk_results):
                    # Calcular índice global do arquivo
                    global_file_index = offset + result_index
                    
                    # Preparar dados do resultado
                    result_data = {
                        "fileName": result.get("file_name", f"arquivo_{global_file_index}"),
                        "success": result.get("success", False),
                        "processedAt": firestore.SERVER_TIMESTAMP
                    }
                    
                    if result.get("success"):
                        # Sucesso: salvar mensagem final
                        result_data["final_message"] = result.get("data", {}).get("final_message")
                        result_data["error"] = None
                        success_count += 1
                    else:
                        # Falha: salvar erro
                        result_data["final_message"] = None
                        result_data["error"] = result.get("error", "Erro desconhecido")
                        failure_count += 1
                    
                    # Salvar na subcoleção results
                    result_ref = job_ref.collection('results').document(str(global_file_index))
                    result_ref.set(result_data)
                    
                    processed_files += 1
                
                # Atualizar progresso no documento principal
                job_ref.update({
                    "processedFiles": processed_files,
                    "successCount": success_count,
                    "failureCount": failure_count
                })
                
                print(f"[ULTRA-BATCH] Chunk {chunk_index + 1} concluído. Progresso: {processed_files}/{len(file_names)}")
                
            except Exception as chunk_error:
                print(f"[ULTRA-BATCH] Erro no chunk {chunk_index + 1}: {chunk_error}")
                
                # Calcular offset para índices globais
                offset = len(files_with_errors) + (chunk_index * chunk_size)
                
                # Marcar arquivos do chunk como falha
                for result_index in range(len(chunk)):
                    global_file_index = offset + result_index
                    result_data = {
                        "fileName": chunk[result_index].get("name", f"arquivo_{global_file_index}"),
                        "success": False,
                        "final_message": None,
                        "error": f"Erro no chunk: {str(chunk_error)}",
                        "processedAt": firestore.SERVER_TIMESTAMP
                    }
                    
                    result_ref = job_ref.collection('results').document(str(global_file_index))
                    result_ref.set(result_data)
                    
                    processed_files += 1
                    failure_count += 1
                
                # Atualizar contadores
                job_ref.update({
                    "processedFiles": processed_files,
                    "failureCount": failure_count
                })
        
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
            
            # 🔗 PADRÃO DE PONTEIRO: Atualizar statusJob no chat como 'failed' (se houver chat_id)
            try:
                job_doc = job_ref.get()
                if job_doc.exists:
                    job_data = job_doc.to_dict()
                    chat_id = job_data.get('chat_id')
                    if chat_id:
                        user_id_from_job = job_data.get('user_id')
                        chat_ref = db.collection('users').document(user_id_from_job).collection('chats').document(chat_id)
                        chat_ref.update({'statusJob': 'failed'})
                        print(f"[ULTRA-BATCH] ❌ Status do chat {chat_id} atualizado para 'failed'")
            except Exception as update_error:
                print(f"[ULTRA-BATCH] ⚠️ Erro ao atualizar status do chat: {update_error}")
        except:
            print(f"[ULTRA-BATCH] Não foi possível atualizar status de erro no Firestore")
        
        raise e
    
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
                # Não falhar o job se limpeza falhar