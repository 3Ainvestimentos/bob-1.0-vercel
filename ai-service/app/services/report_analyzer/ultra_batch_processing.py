"""
Serviço de processamento ultra batch para relatórios XP.
"""
import asyncio
from firebase_admin import firestore
from app.config import get_firestore_client
from app.services.report_analyzer.batch_processing import process_batch_reports


async def process_ultra_batch_reports(files_data, user_id, job_id):
    """
    Processa múltiplos relatórios em chunks de 5 (ultra batch).
    
    Args:
        files_data: Lista de arquivos para processar
        user_id: ID do usuário
        job_id: ID do job no Firestore
    
    Returns:
        None (resultados são salvos no Firestore)
    """
    print(f"[ultra_batch] Iniciando processamento de {len(files_data)} arquivos para job {job_id}")
    
    try:
        # Obter cliente Firestore
        db = get_firestore_client()
        job_ref = db.collection('ultra_batch_jobs').document(job_id)
        
        # Dividir arquivos em chunks de 5
        chunk_size = 5
        chunks = [files_data[i:i + chunk_size] for i in range(0, len(files_data), chunk_size)]
        total_chunks = len(chunks)
        
        print(f"[ultra_batch] Dividido em {total_chunks} chunks de até {chunk_size} arquivos")
        
        # Inicializar contadores
        processed_files = 0
        success_count = 0
        failure_count = 0
        
        # Processar cada chunk sequencialmente
        for chunk_index, chunk in enumerate(chunks):
            print(f"[ultra_batch] Processando chunk {chunk_index + 1}/{total_chunks} com {len(chunk)} arquivos")
            
            try:
                # Reutilizar função de batch existente
                chunk_results = await process_batch_reports(chunk, user_id)
                
                # Salvar resultados no Firestore
                for result_index, result in enumerate(chunk_results):
                    # Calcular índice global do arquivo
                    global_file_index = chunk_index * chunk_size + result_index
                    
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
                
                print(f"[ultra_batch] Chunk {chunk_index + 1} concluído. Progresso: {processed_files}/{len(files_data)}")
                
            except Exception as chunk_error:
                print(f"[ultra_batch] Erro no chunk {chunk_index + 1}: {chunk_error}")
                
                # Marcar arquivos do chunk como falha
                for result_index in range(len(chunk)):
                    global_file_index = chunk_index * chunk_size + result_index
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
        
        # Marcar job como concluído
        job_ref.update({
            "status": "completed",
            "completedAt": firestore.SERVER_TIMESTAMP
        })
        
        # 🔗 PADRÃO DE PONTEIRO: Atualizar statusJob no chat (se houver chat_id)
        try:
            job_doc = job_ref.get()
            if job_doc.exists:
                job_data = job_doc.to_dict()
                chat_id = job_data.get('chat_id')
                if chat_id:
                    user_id_from_job = job_data.get('user_id')
                    chat_ref = db.collection('users').document(user_id_from_job).collection('chats').document(chat_id)
                    chat_ref.update({'statusJob': 'completed'})
                    print(f"[ultra_batch] ✅ Status do chat {chat_id} atualizado para 'completed'")
        except Exception as update_error:
            print(f"[ultra_batch] ⚠️ Erro ao atualizar status do chat: {update_error}")
        
        print(f"[ultra_batch] ✅ Job {job_id} concluído! {success_count} sucessos, {failure_count} falhas")
        
    except Exception as e:
        print(f"[ultra_batch] ❌ Erro crítico no job {job_id}: {e}")
        
        # Marcar job como falhado
        try:
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
                        print(f"[ultra_batch] ❌ Status do chat {chat_id} atualizado para 'failed'")
            except Exception as update_error:
                print(f"[ultra_batch] ⚠️ Erro ao atualizar status do chat: {update_error}")
        except:
            print(f"[ultra_batch] Não foi possível atualizar status de erro no Firestore")
        
        raise e