"""
Serviços de processamento em lote para relatórios XP.
"""
import asyncio
from app.workflows.report_workflow import create_report_analysis_workflow

async def process_batch_reports(files_data: list, user_id: str) -> list:
    """
    Processa múltiplos relatórios em paralelo.
    """
    async def process_single_file(file_data: dict) -> dict:
        try:
            print(f"[batch] Iniciando processamento de: {file_data['name']}")
            
            state = {
                "file_content": file_data["dataUri"],
                "file_name": file_data["name"],
                "user_id": user_id,
                "analysis_mode": "auto",
                "selected_fields": None
            }
            
            print(f"[batch] Chamando report_analysis_app.ainvoke para: {file_data['name']}")
            
            # Adicionar timeout de 2 minutos por arquivo
            try:
                app = create_report_analysis_workflow()
                result = await asyncio.wait_for(
                    app.ainvoke(state),
                    timeout=240.0  # 4 minutos
                )
                print(f"[batch] ✅ Concluído: {file_data['name']}")
            except asyncio.TimeoutError:
                print(f"[batch] ⏰ Timeout em: {file_data['name']}")
                raise Exception(f"Timeout no processamento de {file_data['name']}")
            
            return {
                "success": True,
                "file_name": file_data["name"],
                "data": result
            }
            
        except Exception as e:
            print(f"[batch] ❌ Erro em {file_data['name']}: {e}")
            return {
                "success": False,
                "file_name": file_data["name"],
                "error": str(e)
            }
    
    print(f"[batch] Iniciando processamento de {len(files_data)} arquivos")
    
    # Processar em paralelo
    tasks = [process_single_file(file_data) for file_data in files_data]
    print(f"[batch] Criadas {len(tasks)} tasks")
    
    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        print(f"[batch] Processamento concluído, {len(results)} resultados")
    except Exception as e:
        print(f"[batch] Erro no asyncio.gather: {e}")
        return []
    
    # Tratar exceções
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"[batch] Exceção no arquivo {i}: {result}")
            processed_results.append({
                "success": False,
                "file_name": files_data[i]["name"],
                "error": str(result)
            })
        else:
            processed_results.append(result)
    
    print(f"[batch] Retornando {len(processed_results)} resultados processados")
    return processed_results