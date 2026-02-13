"""
Endpoints para análise de relatórios XP.
"""
from typing import Dict, Any
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse

from app.models.requests import (    
    ReportAnalyzeAutoRequest, 
    ReportAnalyzePersonalizedRequest,
    ReportAnalyzeResponse,
    BatchReportRequest,
    BatchReportResponse,
    UltraBatchReportRequest, 
    UltraBatchReportResponse,
    GenerateUploadUrlsRequest,
    GenerateUploadUrlsResponse 
)
from app.workflows.report_workflow import create_report_analysis_workflow, create_report_analysis_workflow_from_data

from app.services.report_analyzer.batch_processing import process_batch_reports
from app.services.report_analyzer.ultra_batch_processing import process_ultra_batch_reports  
from app.services.report_analyzer.signed_url import generate_signed_url_for_upload

from pydantic import BaseModel

from app.config import get_firestore_client, logger
from firebase_admin import firestore  
import uuid
from app.services.metrics import record_metric_call, record_ultra_batch_start, record_ultra_batch_complete 



router = APIRouter(tags=["report"])  # Remover o prefix


@router.post("/analyze-auto", response_model=ReportAnalyzeResponse)
async def analyze_report_auto(request: ReportAnalyzeAutoRequest):
    """
    Análise automática completa (todos os dados).
    
    Processa o relatório XP e retorna:
    - Dados extraídos
    - Análise de performance
    - Highlights e detractors
    - Mensagem WhatsApp formatada
    """
    try:
        state = {
            "file_content": request.file_content,
            "file_name": request.file_name,
            "user_id": request.user_id,
            "analysis_mode": "auto",
            "selected_fields": None
        }
        
        app = create_report_analysis_workflow()
        result = await app.ainvoke(state)
        
        # Registrar métrica após processamento bem-sucedido
        if result.get("error") is None:
            try:
                record_metric_call(request.user_id, "automatica")
            except Exception as e:
                logger.error(f"Erro ao registrar métrica analise_automatica: {e}")
        
        return ReportAnalyzeResponse(
            success=True,
            extracted_data=result.get("extracted_data"),
            file_name=request.file_name, 
            highlights=result.get("highlights"),
            detractors=result.get("detractors"),
            final_message=result.get("final_message"),
            metadata=result.get("metadata"),
            error=result.get("error")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-personalized", response_model=ReportAnalyzeResponse)
async def analyze_report_personalized(request: ReportAnalyzePersonalizedRequest):
    """
    Análise personalizada com campos selecionados pelo usuário.
    
    Processa apenas os campos escolhidos pelo usuário:
    - Campos top-level (monthlyReturn, yearlyReturn, etc.)
    - Classes de ativo específicas
    - Highlights/detractors filtrados
    """
    try:
        state = {
            "file_content": request.file_content,
            "file_name": request.file_name,
            "user_id": request.user_id,
            "analysis_mode": "personalized",
            "selected_fields": request.selected_fields
        }
        
        app = create_report_analysis_workflow()
        result = await app.ainvoke(state)
        
        # Registrar métrica após processamento bem-sucedido
        if result.get("error") is None:
            try:
                record_metric_call(request.user_id, "personalized")
            except Exception as e:
                logger.error(f"Erro ao registrar métrica analise_personalized: {e}")
        
        return ReportAnalyzeResponse(
            success=True,
            extracted_data=result.get("extracted_data"),
            file_name=request.file_name, 
            highlights=result.get("highlights"),
            detractors=result.get("detractors"),
            final_message=result.get("final_message"),
            metadata=result.get("metadata"),
            error=result.get("error")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract", response_model=ReportAnalyzeResponse)
async def extract_report_data(request: ReportAnalyzeAutoRequest):
    """
    Apenas extração de dados (para UI de seleção de campos).
    
    Retorna apenas os dados extraídos do PDF, sem análise ou formatação.
    Usado para permitir que o usuário selecione quais campos analisar.
    """
    try:
        state = {
            "file_content": request.file_content,
            "file_name": request.file_name,
            "user_id": request.user_id,
            "analysis_mode": "extract_only",
            "selected_fields": None
        }
        
        app = create_report_analysis_workflow()
        result = await app.ainvoke(state)
        
        return ReportAnalyzeResponse(
            success=True,
            extracted_data=result.get("extracted_data"),
            file_name=request.file_name, 
            highlights=None,
            detractors=None,
            final_message=None,
            metadata=result.get("metadata"),
            error=result.get("error")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-analyze", response_model=BatchReportResponse)
async def batch_analyze_reports(request: BatchReportRequest):
    """
    Processa múltiplos relatórios em paralelo (máximo 10).
    
    Sempre usa modo 'auto' para batch processing.
    Cada arquivo é processado independentemente.
    """
    try:
        if len(request.files) > 5:
            raise HTTPException(
                status_code=400, 
                detail="Máximo de 5 arquivos por lote"
            )
        
        results = await process_batch_reports(request.files, request.user_id)

        success_count = sum(1 for r in results if r.get("success"))
        for _ in range(success_count):
            try:
                record_metric_call(request.user_id, "automatica")
            except Exception as e:
                logger.error(f"Erro ao registrar métrica analise_automatica: {e}")
        
        # Converter resultados para ReportAnalyzeResponse
        report_responses = []
        for result in results:
            if result.get("success"):
                # Sucesso: converter para ReportAnalyzeResponse
                report_responses.append(ReportAnalyzeResponse(
                    success=True,
                    extracted_data=result["data"].get("extracted_data"),
                    file_name=result.get("file_name"),
                    highlights=result["data"].get("highlights"),
                    detractors=result["data"].get("detractors"),
                    final_message=result["data"].get("final_message"),
                    metadata=result["data"].get("metadata"),
                    error=None
                ))
            else:
                # Falha: criar ReportAnalyzeResponse com erro
                report_responses.append(ReportAnalyzeResponse(
                    success=False,
                    file_name=result.get("file_name"),
                    extracted_data=None,
                    highlights=None,
                    detractors=None,
                    final_message=None,
                    metadata=None,
                    error=result.get("error", "Erro desconhecido")
                ))
        
        success_count = sum(1 for r in report_responses if r.success)
        
        return BatchReportResponse(
            success=True,
            results=report_responses,
            metadata={
                "total_files": len(request.files),
                "success_count": success_count,
                "failure_count": len(request.files) - success_count
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= GENERATE UPLOAD URLS =============

@router.post("/generate-upload-urls", response_model=GenerateUploadUrlsResponse)
async def generate_upload_urls(request: GenerateUploadUrlsRequest):
    """
    Gera Signed URLs para upload direto ao GCS.
    
    Frontend usa essas URLs para fazer upload paralelo dos arquivos,
    bypassando completamente o servidor Next.js.
    
    Fluxo:
    1. Frontend envia nomes dos arquivos
    2. Backend gera batch_id único
    3. Backend gera Signed URL para cada arquivo
    4. Backend salva metadados do batch no Firestore
    5. Backend retorna batch_id + Signed URLs
    """
    logger.info(f"🔗 [SIGNED-URL] Request recebido: user_id={request.user_id}, chat_id={request.chat_id}, files={len(request.file_names)}")
    
    try:
        # 1. Gerar batch_id único
        batch_id = str(uuid.uuid4())
        logger.info(f"🔗 [SIGNED-URL] Batch ID gerado: {batch_id}")
        
        # 2. Obter cliente Firestore
        db = get_firestore_client()
        
        # 3. Preparar lista de upload URLs
        upload_urls = []
        storage_paths = []
        
        # 4. Gerar Signed URL para cada arquivo
        for file_name in request.file_names:
            # Criar caminho no GCS: ultra-batch/{batch_id}/{fileName}
            storage_path = f"ultra-batch/{batch_id}/{file_name}"
            
            try:
                # Gerar Signed URL com permissão WRITE (método PUT)
                signed_url = generate_signed_url_for_upload(
                    blob_path=storage_path,
                    expiration_hours=1  # URLs expiram em 1 hora
                )
                
                upload_urls.append({
                    "fileName": file_name,
                    "signedUrl": signed_url,
                    "storagePath": storage_path
                })
                storage_paths.append(storage_path)
                
                logger.info(f"✅ [SIGNED-URL] URL gerada para: {file_name}")
                
            except Exception as url_error:
                logger.error(f"❌ [SIGNED-URL] Erro ao gerar URL para {file_name}: {url_error}")
                # Não falhar o request inteiro, apenas logar o erro
                continue
        
        # 5. Validar que pelo menos uma URL foi gerada
        if not upload_urls:
            logger.error("❌ [SIGNED-URL] Nenhuma URL foi gerada com sucesso")
            raise HTTPException(
                status_code=500,
                detail="Não foi possível gerar Signed URLs. Verifique os logs."
            )
        
        # 6. Salvar metadados do batch no Firestore
        batch_ref = db.collection('ultra_batch_uploads').document(batch_id)
        batch_data = {
            'user_id': request.user_id,
            'file_names': request.file_names,
            'storage_paths': storage_paths,
            'status': 'uploading',  # Status inicial: aguardando upload
            'created_at': firestore.SERVER_TIMESTAMP,
            'total_files': len(request.file_names)
        }
        
        # Adicionar chat_id se fornecido
        if request.chat_id:
            batch_data['chat_id'] = request.chat_id
        
        batch_ref.set(batch_data)
        logger.info(f"✅ [SIGNED-URL] Metadados do batch salvos no Firestore: {batch_id}")
        
        # 7. Retornar response
        return GenerateUploadUrlsResponse(
            batch_id=batch_id,
            upload_urls=upload_urls
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (já têm status code apropriado)
        raise
    except Exception as e:
        logger.error(f"❌ [SIGNED-URL] Erro crítico: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gerar Signed URLs: {str(e)}"
        )

# Implementar o endpoint (adicionar no final do arquivo):
@router.post("/ultra-batch-analyze")
async def ultra_batch_analyze_reports(request: Request, body: UltraBatchReportRequest):
    """
    Análise em ultra lote (até 100 relatórios) com Streaming Response (SSE).
    
    Agora recebe apenas batch_id (arquivos já estão no GCS via upload direto).
    Mantém conexão HTTP aberta enviando eventos de progresso.
    """
    logger.info(f"🔗 [ULTRA-BATCH] Request recebido: batch_id={body.batch_id}, user_id={body.user_id}, chat_id={body.chat_id}")

    try:
        # 1. Obter cliente Firestore
        db = get_firestore_client()
        
        # 2. Buscar metadados do batch no Firestore
        batch_ref = db.collection('ultra_batch_uploads').document(body.batch_id)
        batch_doc = batch_ref.get()
        
        if not batch_doc.exists:
            logger.error(f"❌ [ULTRA-BATCH] Batch não encontrado: {body.batch_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Batch {body.batch_id} não encontrado. Verifique se o upload foi concluído."
            )
        
        batch_data = batch_doc.to_dict()
        total_files = batch_data.get('total_files', 0)
        
        # 3. Validar que o batch pertence ao usuário
        if batch_data.get('user_id') != body.user_id:
            logger.error(f"❌ [ULTRA-BATCH] Batch {body.batch_id} não pertence ao usuário {body.user_id}")
            raise HTTPException(
                status_code=403,
                detail="Você não tem permissão para processar este batch."
            )
        
        # 4. Gerar job_id único para o processamento
        job_id = str(uuid.uuid4())
        logger.info(f"🔗 [ULTRA-BATCH] Job ID gerado: {job_id}")
        
        # 5. Salvar job no Firestore
        job_ref = db.collection('ultra_batch_jobs').document(job_id)
        job_data = {
            'user_id': body.user_id,
            'batch_id': body.batch_id,  # Vincular job ao batch
            'total_files': total_files,
            'status': 'processing',
            'current_file': 0,
            'created_at': firestore.SERVER_TIMESTAMP,
            'estimated_time_minutes': total_files * 2  # 2 min por arquivo
        }
        
        # Se chat_id foi fornecido, salvá-lo no job
        if body.chat_id:
            job_data['chat_id'] = body.chat_id
        
        job_ref.set(job_data)
        logger.info(f"✅ [ULTRA-BATCH] Job criado no Firestore: {job_id}")
        
        # Registrar métrica de ultra-batch após criar job
        try:
            record_ultra_batch_start(body.user_id, job_id, total_files)
        except Exception as e:
            logger.error(f"Erro ao registrar métrica ultra-batch: {e}")
        
        # 6. Atualizar status do batch para 'processing'
        batch_ref.update({
            'status': 'processing',
            'job_id': job_id
        })
        
        # 7. 🔗 PADRÃO DE PONTEIRO: Se chat_id foi fornecido, salvar batchJobId no documento do chat
        if body.chat_id:
            try:
                chat_ref = db.collection('users').document(body.user_id).collection('chats').document(body.chat_id)
                chat_ref.update({
                    'batchJobId': job_id,
                    'statusJob': 'processing'
                })
                logger.info(f"✅ [ULTRA-BATCH] Ponteiro salvo: chat {body.chat_id} -> job {job_id}")
            except Exception as e:
                # Não falhar o job se não conseguir atualizar o chat
                logger.warning(f"⚠️ [ULTRA-BATCH] Erro ao salvar ponteiro no chat {body.chat_id}: {e}")
        
        
        logger.info(f"✅ [ULTRA-BATCH] Iniciando stream para job {job_id}")
        
        async def stream_wrapper():
            try:
                # Consumir o generator do serviço
                async for event in process_ultra_batch_reports(body.batch_id, body.user_id, job_id):
                    # Verificar desconexão (apenas logar, não cancelar para permitir refresh)
                    if await request.is_disconnected():
                        logger.warning(f"⚠️ [ULTRA-BATCH] Cliente desconectou do job {job_id} (mantendo processamento)")
                        # Não cancelar o job aqui. O Cloud Run deve manter a instância viva pelo tempo que puder.
                        # Se quisermos cancelar explicitamente, deve ser via outro endpoint ou lógica de timeout.
                    
                    yield event
            except Exception as e:
                logger.error(f"❌ [ULTRA-BATCH] Erro no stream wrapper: {e}")
                yield f"data: {json.dumps({'event': 'fatal_error', 'error': str(e)})}\n\n"

        return StreamingResponse(
            stream_wrapper(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (já têm status code apropriado)
        raise
    except Exception as e:
        logger.error(f"❌ [ULTRA-BATCH] Erro crítico: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/ultra-batch-status/{job_id}")
async def get_ultra_batch_status(job_id: str):
    """
    Consulta status e resultados do job ultra batch.
    
    Retorna dados em tempo real do Firestore:
    - Status do job (processing/completed/failed)
    - Progresso atual
    - Resultados já processados (exposição incremental)
    """
    try:
        db = get_firestore_client()
        job_ref = db.collection('ultra_batch_jobs').document(job_id)
        
        # Buscar dados do job
        job_doc = job_ref.get()
        if not job_doc.exists:
            raise HTTPException(status_code=404, detail="Job não encontrado")
        
        job_data = job_doc.to_dict()
        
        # Buscar resultados já processados
        results_ref = job_ref.collection('results')
        results_docs = results_ref.order_by('processedAt').stream()
        
        results = []
        for doc in results_docs:
            result_data = doc.to_dict()
            results.append({
                "fileIndex": int(doc.id),
                "fileName": result_data.get("fileName"),
                "success": result_data.get("success", False),
                "finalMessage": result_data.get("final_message"),
                "error": result_data.get("error"),
                "processedAt": result_data.get("processedAt")
            })
        
        return {
            "success": True,
            "jobId": job_id,
            "status": job_data.get("status", "unknown"),
            "progress": {
                "processedFiles": job_data.get("processedFiles", 0),
                "totalFiles": job_data.get("total_files", 0),
                "successCount": job_data.get("successCount", 0),
                "failureCount": job_data.get("failureCount", 0)
            },
            "results": results,
            "createdAt": job_data.get("created_at"),
            "completedAt": job_data.get("completedAt"),
            "estimatedTimeMinutes": job_data.get("estimated_time_minutes", 0)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao consultar job: {str(e)}")



# ============= STREAMING ENDPOINTS (SSE) =============

@router.post("/analyze-auto-stream")
async def analyze_report_auto_stream(request: ReportAnalyzeAutoRequest):
    """
    Análise automática com streaming de progresso (SSE).
    
    Retorna progresso em tempo real via Server-Sent Events.
    """
    async def event_generator():
        async def progress_callback(status):
            yield f"data: {json.dumps(status)}\n\n"
        
        state = {
            "file_content": request.file_content,
            "file_name": request.file_name,
            "user_id": request.user_id,
            "analysis_mode": "auto",
            "selected_fields": None
        }
        
        # TODO: Implementar analyze_report_with_progress
        # Por enquanto, usar o workflow normal
        app = create_report_analysis_workflow()
        result = await app.ainvoke(state)

        if result.get("error") is None:
            try:
                record_metric_call(request.user_id, "automatica")
            except Exception as e:
                logger.error(f"Erro ao registrar métrica analise_automatica: {e}")

        yield f"data: {json.dumps({'done': True, 'result': result})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.post("/analyze-personalized-stream")
async def analyze_report_personalized_stream(request: ReportAnalyzePersonalizedRequest):
    """
    Análise personalizada com streaming de progresso (SSE).
    
    Retorna progresso em tempo real via Server-Sent Events.
    """
    async def event_generator():
        async def progress_callback(status):
            yield f"data: {json.dumps(status)}\n\n"
        
        state = {
            "file_content": request.file_content,
            "file_name": request.file_name,
            "user_id": request.user_id,
            "analysis_mode": "personalized",
            "selected_fields": request.selected_fields
        }
        
        # TODO: Implementar analyze_report_with_progress
        # Por enquanto, usar o workflow normal
        app = create_report_analysis_workflow()
        result = await app.ainvoke(state)

        if result.get("error") is None:
            try:
                record_metric_call(request.user_id, "personalized")
            except Exception as e:
                logger.error(f"Erro ao registrar métrica analise_personalized: {e}")

        yield f"data: {json.dumps({'done': True, 'result': result})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

class PersonalizedAnalysisRequest(BaseModel):
    extracted_data: Dict[str, Any]
    selected_fields: Dict[str, Any]
    file_name: str
    user_id: str

@router.post("/analyze-personalized-from-data")
async def analyze_personalized_from_data(
    request: PersonalizedAnalysisRequest
):
    """
    Análise personalizada usando dados já extraídos.
    """
    try:
        logger.info("[analyze_personalized_from_data] Iniciando análise com dados já extraídos")
        logger.debug(
            "[analyze_personalized_from_data] Campos selecionados: %d",
            len(request.selected_fields),
        )

        state = {
            "extracted_data": request.extracted_data,
            "file_name": request.file_name,
            "user_id": request.user_id,
            "analysis_mode": "personalized",
            "selected_fields": request.selected_fields
        }
        
        # Pular extração e ir direto para análise
        app = create_report_analysis_workflow_from_data()
        result = await app.ainvoke(state)

        if result.get("error") is None:
            try:
                record_metric_call(request.user_id, "personalized")
            except Exception as e:
                logger.error(f"Erro ao registrar métrica analise_personalized: {e}")

        logger.info("[analyze_personalized_from_data] Análise concluída")

        return ReportAnalyzeResponse(
            success=True,
            extracted_data=result.get("extracted_data"),
            file_name=request.file_name, 
            highlights=result.get("highlights"),
            detractors=result.get("detractors"),
            final_message=result.get("final_message"),
            metadata=result.get("metadata"),
            error=result.get("error")
        )
    except Exception as e:
        logger.error("[analyze_personalized_from_data] Erro: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
