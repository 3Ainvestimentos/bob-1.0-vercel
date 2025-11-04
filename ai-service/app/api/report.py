"""
Endpoints para análise de relatórios XP.
"""
from typing import Dict, Any  # ← ADICIONAR Dict
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks 
from fastapi.responses import StreamingResponse

from app.models.requests import (    
    ReportAnalyzeAutoRequest, 
    ReportAnalyzePersonalizedRequest,
    ReportAnalyzeResponse,
    BatchReportRequest,
    BatchReportResponse,
    UltraBatchReportRequest, 
    UltraBatchReportResponse 
)
from app.workflows.report_workflow import create_report_analysis_workflow, create_report_analysis_workflow_from_data

from app.services.report_analyzer.batch_processing import process_batch_reports
from app.services.report_analyzer.ultra_batch_processing import process_ultra_batch_reports  

from pydantic import BaseModel
from typing import Dict, Any

from app.config import get_firestore_client, logger
from firebase_admin import firestore  



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
            "analysis_mode": "personalized",
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

        # ============= ultra_batch (ultra lote) =============

# Implementar o endpoint (adicionar no final do arquivo):
@router.post("/ultra-batch-analyze", response_model=UltraBatchReportResponse)
async def ultra_batch_analyze_reports(request: UltraBatchReportRequest, background_tasks: BackgroundTasks):
    """
    Análise em ultra lote (até 100 relatórios).
    
    Cria um job assíncrono no Firestore e processa os arquivos em background.
    """
    logger.info(f"🔗 Request recebido em ultra-batch-analyze: user_id={request.user_id}, chat_id={request.chat_id}")

    try:
        # Gerar job_id único
        import uuid
        job_id = str(uuid.uuid4())
        
        # Salvar job no Firestore
        db = get_firestore_client()
        job_ref = db.collection('ultra_batch_jobs').document(job_id)
        
        job_data = {
            'user_id': request.user_id,
            'total_files': len(request.files),
            'status': 'processing',
            'current_file': 0,
            'created_at': firestore.SERVER_TIMESTAMP,
            'estimated_time_minutes': len(request.files) * 2  # 2 min por arquivo
        }
        
        # Se chat_id foi fornecido, salvá-lo no job para referência futura
        if request.chat_id:
            job_data['chat_id'] = request.chat_id
        
        job_ref.set(job_data)
        
        # 🔗 PADRÃO DE PONTEIRO: Se chat_id foi fornecido, salvar batchJobId no documento do chat
        if request.chat_id:
            try:
                chat_ref = db.collection('users').document(request.user_id).collection('chats').document(request.chat_id)
                chat_ref.update({
                    'batchJobId': job_id,
                    'statusJob': 'processing'
                })
                logger.info(f"✅ Ponteiro salvo: chat {request.chat_id} -> job {job_id}")
            except Exception as e:
                # Não falhar o job se não conseguir atualizar o chat
                logger.warning(f"⚠️ Erro ao salvar ponteiro no chat {request.chat_id}: {e}")
        
        # Iniciar processamento em background
        background_tasks.add_task(
            process_ultra_batch_reports,
            request.files,
            request.user_id,
            job_id
        )
        
        return UltraBatchReportResponse(
            success=True,
            job_id=job_id,
            total_files=len(request.files),
            estimated_time_minutes=len(request.files) * 2
        )
        
    except Exception as e:
        return UltraBatchReportResponse(
            success=False,
            job_id="",
            total_files=0,
            estimated_time_minutes=0,
            error=str(e)
        )



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
        
        # Enviar resultado final
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
        result = await report_analysis_app.ainvoke(state)
        
        # Enviar resultado final
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

# Substituir linhas 270-311 por:
@router.post("/analyze-personalized-from-data")
async def analyze_personalized_from_data(
    request: PersonalizedAnalysisRequest
):
    """
    Análise personalizada usando dados já extraídos.
    """
    try:
        print(f"[analyze_personalized_from_data] Iniciando análise com dados já extraídos")
        print(f"[analyze_personalized_from_data] Campos selecionados: {len(request.selected_fields)}")

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

        print(f"[analyze_personalized_from_data] ✅ Análise concluída")
        
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
        print(f"[analyze_personalized_from_data] ❌ Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))