"""
Endpoint para análise de reuniões.
"""
import base64
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.workflows.meeting_workflow import meeting_analysis_app
from app.models.requests import AnalysisResponse, MetadataResponse, AnalyzeResponse
from app.models.schema import MeetingAnalysisState

router = APIRouter(prefix="/api", tags=["analysis"])

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_meeting(file: UploadFile = File(...)):
    """
    Analisa uma transcrição de reunião e retorna insights.
    
    Args:
        file: Arquivo .docx com a transcrição da reunião
        
    Returns:
        AnalysisResponse: Resumo e oportunidades identificadas
    """
    try:
        # Validar tipo de arquivo
        if not file.filename.endswith('.docx'):
            raise HTTPException(
                status_code=400, 
                detail="Apenas arquivos .docx são aceitos"
            )
        
        # Ler conteúdo do arquivo
        file_content = await file.read()
        
        # Converter para base64 (formato esperado pelo workflow)
        file_base64 = base64.b64encode(file_content).decode('utf-8')
        
        # Estado inicial
        initial_state: MeetingAnalysisState = {
        "file_content": file_base64,
        "file_name": file.filename,
        "user_id": "anonymous",
        "raw_text": "",
        "chunks": [],
        "partial_summaries": [],
        "partial_opportunities": [],
        "final_summary": "",
        "final_opportunities": [],
        "metadata": {
            "filename": file.filename,
            "file_size": len(file_content),
            "chunk_count": 0,
            "processing_time": 0.0
        },
        "error": None
    }
        
        # Executar workflow
        result = await meeting_analysis_app.ainvoke(
            initial_state, 
            config={"configurable": {}}
        )

                # Debug: ver o que está sendo retornado
        print(f"🔍 DEBUG - Result keys: {result.keys()}")
        print(f"🔍 DEBUG - final_summary: {result.get('final_summary', 'NOT_FOUND')}")
        print(f"🔍 DEBUG - final_opportunities: {result.get('final_opportunities', 'NOT_FOUND')}")
        
        # Retornar resposta formatada
        return AnalyzeResponse(
            success=True,
            summary=result.get("final_summary", ""),
            opportunities=result.get("final_opportunities", []),
            metadata=MetadataResponse(
                processingTimeMs=int(result.get("metadata", {}).get("processing_time", 0) * 1000),
                chunksProcessed=result.get("metadata", {}).get("chunk_count", 0),
                modelUsed="gemini-2.0-flash",
                totalTokens=None
            )
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar arquivo: {str(e)}"
        )