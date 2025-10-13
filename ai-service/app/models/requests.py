"""
Modelos Pydantic para request/response da API.
FastAPI usa estes modelos para validação automática e geração de documentação.
"""
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any


# ============= REQUEST MODELS =============

class AnalyzeRequest(BaseModel):
    """
    Request body para o endpoint POST /api/analyze
    
    Exemplo:
    {
        "file": "data:application/vnd...",
        "fileName": "reuniao_cliente_x.docx",
        "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "userId": "user_abc123"
    }
    """
    file: str = Field(
        ...,
        description="Arquivo .docx codificado em base64 (data URI)",
        min_length=1
    )
    fileName: str = Field(
        ...,
        description="Nome do arquivo",
        example="reuniao_2025_01_15.docx"
    )
    mimeType: str = Field(
        ...,
        description="MIME type do arquivo",
        example="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    userId: str = Field(
        ...,
        description="ID do usuário que está fazendo a requisição",
        min_length=1
    )
    
    @validator('mimeType')
    def validate_mime_type(cls, v):
        """Valida se o MIME type é de um .docx"""
        allowed_types = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
        ]
        if v not in allowed_types:
            raise ValueError(f'MIME type inválido. Apenas .docx é suportado. Recebido: {v}')
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "file": "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBBQABgAI...",
                "fileName": "reuniao_cliente.docx",
                "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "userId": "user_123"
            }
        }


# ============= RESPONSE MODELS =============

class OpportunityResponse(BaseModel):
    """
    Modelo para uma oportunidade identificada.
    """
    title: str = Field(..., description="Título da oportunidade")
    description: str = Field(..., description="Descrição detalhada")
    priority: str = Field(..., description="Prioridade: 'high', 'medium', ou 'low'")
    clientMentions: Optional[List[str]] = Field(
        default=[],
        description="Trechos da transcrição que mencionam esta oportunidade"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "Venda de Previdência Privada",
                "description": "Cliente mencionou interesse em planejar aposentadoria",
                "priority": "high",
                "clientMentions": [
                    "Estou pensando em me aposentar nos próximos 5 anos",
                    "Preciso de uma forma de garantir renda no futuro"
                ]
            }
        }


class MetadataResponse(BaseModel):
    """
    Metadados sobre o processamento.
    """
    processingTimeMs: int = Field(..., description="Tempo de processamento em milissegundos")
    chunksProcessed: int = Field(..., description="Número de chunks processados")
    modelUsed: str = Field(..., description="Modelo de IA utilizado")
    totalTokens: Optional[int] = Field(None, description="Total de tokens processados")
    
    class Config:
        json_schema_extra = {
            "example": {
                "processingTimeMs": 3456,
                "chunksProcessed": 5,
                "modelUsed": "gemini-2.0-flash-exp",
                "totalTokens": 12450
            }
        }


class AnalyzeResponse(BaseModel):
    """
    Response body para o endpoint POST /api/analyze
    
    Retorna o resumo da reunião e lista de oportunidades identificadas.
    """
    success: bool = Field(default=True, description="Indica se a análise foi bem-sucedida")

    summary: str = Field(
        ...,
        description="Resumo consolidado da reunião"
    )
    opportunities: List[OpportunityResponse] = Field(
        ...,
        description="Lista de oportunidades de negócio identificadas"
    )
    metadata: MetadataResponse = Field(
        ...,
        description="Informações sobre o processamento"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "summary": "Reunião com cliente focada em planejamento financeiro...",
                "opportunities": [
                    {
                        "title": "Previdência Privada",
                        "description": "Cliente demonstrou interesse em planejar aposentadoria",
                        "priority": "high",
                        "clientMentions": ["Quero me aposentar tranquilo"]
                    }
                ],
                "metadata": {
                    "processingTimeMs": 2340,
                    "chunksProcessed": 3,
                    "modelUsed": "gemini-2.0-flash-exp"
                }
            }
        }


class ErrorResponse(BaseModel):
    """
    Response padrão para erros.
    """
    detail: str = Field(..., description="Mensagem de erro")
    error_code: Optional[str] = Field(None, description="Código do erro para debugging")
    
    class Config:
        json_schema_extra = {
            "example": {
                "detail": "Erro ao processar arquivo: formato inválido",
                "error_code": "INVALID_FILE_FORMAT"
            }
        }

class AnalysisResponse(BaseModel):
    """
    Resposta da análise de reunião.
    """
    success: bool = Field(
        description="Indica se a análise foi bem-sucedida"
    )
    
    summary: str = Field(
        description="Resumo executivo da reunião"
    )
    
    opportunities: List[str] = Field(
        description="Lista de oportunidades identificadas",
        default_factory=list
    )
    
    metadata: Dict[str, Any] = Field(
        description="Metadados adicionais da análise",
        default_factory=dict
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "summary": "Reunião com cliente interessado em investimentos de longo prazo...",
                "opportunities": [
                    "Previdência PGBL - Cliente mostrou interesse em aportes mensais",
                    "Fundos de renda fixa - Migrar parte da poupança"
                ],
                "metadata": {
                    "filename": "reuniao-cliente.docx",
                    "file_size": 2048,
                    "chunk_count": 3,
                    "processing_time": 12.5
                }
            }
        }