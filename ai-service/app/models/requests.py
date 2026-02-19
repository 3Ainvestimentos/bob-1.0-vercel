"""
Modelos Pydantic para request/response da API.
FastAPI usa estes modelos para validação automática e geração de documentação.
"""
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any


# ============= MEETING ANALYZER REQUEST MODELS =============

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


# ============= REPORT ANALYZER MODELS =============

class ReportAnalyzeAutoRequest(BaseModel):
    """
    Request para análise automática de relatório XP.
    """
    file_content: str = Field(
        ...,
        description="PDF em base64 (sem prefixo data:...)",
        min_length=1
    )
    file_name: str = Field(
        ...,
        description="Nome do arquivo PDF",
        example="XPerformance_123456_Ref.29.08.pdf"
    )
    user_id: str = Field(
        ...,
        description="ID do usuário",
        min_length=1
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "file_content": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK...",
                "file_name": "XPerformance_123456_Ref.29.08.pdf",
                "user_id": "user_123"
            }
        }


class ReportAnalyzePersonalizedRequest(BaseModel):
    """
    Request para análise personalizada de relatório XP.
    """
    file_content: str = Field(
        ...,
        description="PDF em base64 (sem prefixo data:...)",
        min_length=1
    )
    file_name: str = Field(
        ...,
        description="Nome do arquivo PDF",
        example="XPerformance_123456_Ref.29.08.pdf"
    )
    user_id: str = Field(
        ...,
        description="ID do usuário",
        min_length=1
    )
    selected_fields: Dict[str, Any] = Field(
        ...,
        description="Campos selecionados pelo usuário para análise personalizada"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "file_content": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK...",
                "file_name": "XPerformance_123456_Ref.29.08.pdf",
                "user_id": "user_123",
                "selected_fields": {
                    "monthlyReturn": True,
                    "yearlyReturn": True,
                    "classPerformance": {
                        "Pós Fixado": True,
                        "Inflação": False
                    },
                    "highlights": {
                        "Pós Fixado": {0: True}
                    }
                }
            }
        }


class BatchReportRequest(BaseModel):
    """
    Request para processamento em lote de relatórios XP.
    """
    files: List[Dict[str, str]] = Field(
        ...,
        description="Lista de arquivos para processamento em lote",
        min_items=1,
        max_items=10
    )
    user_id: str = Field(
        ...,
        description="ID do usuário",
        min_length=1
    )
    
    @validator('files')
    def validate_files(cls, v):
        """Valida estrutura dos arquivos."""
        for file_data in v:
            if not isinstance(file_data, dict):
                raise ValueError('Cada arquivo deve ser um objeto')
            if 'name' not in file_data or 'dataUri' not in file_data:
                raise ValueError('Cada arquivo deve ter "name" e "dataUri"')
            if not file_data['name'].endswith('.pdf'):
                raise ValueError('Apenas arquivos PDF são aceitos')
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "files": [
                    {
                        "name": "XPerformance_123456_Ref.29.08.pdf",
                        "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK..."
                    },
                    {
                        "name": "XPerformance_789012_Ref.30.08.pdf", 
                        "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK..."
                    }
                ],
                "user_id": "user_123"
            }
        }


class ReportAnalyzeResponse(BaseModel):
    """
    Response para análise de relatório XP.
    """
    success: bool = Field(
        ...,
        description="Indica se a análise foi bem-sucedida"
    )
    extracted_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Dados extraídos do relatório"
    )
    file_name: Optional[str] = Field(
        None,
        description="Nome do arquivo processado"
    )
    highlights: Optional[List[Dict]] = Field(
        None,
        description="Classes de ativo com performance superior ao benchmark"
    )
    detractors: Optional[List[Dict]] = Field(
        None,
        description="Classes de ativo com performance inferior ao benchmark"
    )
    final_message: Optional[str] = Field(
        None,
        description="Mensagem WhatsApp formatada"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Metadados do processamento"
    )
    error: Optional[str] = Field(
        None,
        description="Mensagem de erro, se houver"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "extracted_data": {
                    "accountNumber": "123456",
                    "reportMonth": "09/2024",
                    "monthlyReturn": "1,06%",
                    "benchmarkValues": {
                        "CDI": "1,16%",
                        "IPCA": "-0,13%"
                    }
                },
                "file_name": "relatorio_exemplo.pdf",
                "highlights": [
                    {
                        "className": "Inflação",
                        "return": "0,89%",
                        "difference": "1,02%"
                    }
                ],
                "detractors": [
                    {
                        "className": "Multimercado",
                        "return": "-1,24%"
                    }
                ],
                "final_message": "Olá, 123456!\n🔎 Resumo da performance...",
                "metadata": {
                    "processing_time": 15.2,
                    "model_used": "gemini-2.0-flash"
                }
            }
        }


class BatchReportResponse(BaseModel):
    """
    Response para processamento em lote de relatórios XP.
    """
    success: bool = Field(
        ...,
        description="Indica se o processamento foi bem-sucedido"
    )
    results: List[ReportAnalyzeResponse] = Field(
        ...,
        description="Resultados de cada arquivo processado (um ReportAnalyzeResponse por arquivo)"
    )
    metadata: Dict[str, Any] = Field(
        ...,
        description="Metadados do processamento em lote"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "results": [
                    {
                        "success": True,
                        "extracted_data": {
                            "accountNumber": "123456",
                            "reportMonth": "09/2024"
                        },
                        "final_message": "Olá, 123456!\n🔎 Resumo da performance...",
                        "metadata": {"processing_time": 15.2}
                    },
                    {
                        "success": False,
                        "extracted_data": None,
                        "final_message": None,
                        "error": "Erro ao processar PDF"
                    }
                ],
                "metadata": {
                    "total_files": 2,
                    "success_count": 1,
                    "failure_count": 1
                }
            }
        }



# --------- ULTRA BATCH MODELS
class UltraBatchReportRequest(BaseModel):
    """
    Request para iniciar processamento de ultra batch.
    
    Agora recebe apenas batch_id (arquivos já estão no GCS via upload direto).
    """
    batch_id: str = Field(
        ...,
        description="ID do batch (retornado pelo endpoint /generate-upload-urls)",
        min_length=1
    )
    user_id: str = Field(
        ...,
        description="ID do usuário que está fazendo a requisição",
        min_length=1
    )
    chat_id: Optional[str] = Field(
        None,
        description="ID do chat/conversa (opcional). Quando fornecido, o backend salvará o batchJobId no documento do chat."
    )

    class Config:
        schema_extra = {
            "example": {
                "batch_id": "550e8400-e29b-41d4-a716-446655440000",
                "user_id": "user123abc",
                "chat_id": "chat789xyz"
            }
        }

class UltraBatchReportResponse(BaseModel):
    success:bool
    job_id:str
    total_files:int
    estimated_time_minutes:int
    error: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "total_files": 50,
                "estimated_time_minutes": 25,
                "error": None
            }
        }


# ============= GENERATE UPLOAD URLS MODELS =============

class GenerateUploadUrlsRequest(BaseModel):
    """
    Request para gerar Signed URLs para upload direto ao GCS.
    
    Frontend envia apenas nomes dos arquivos (sem conteúdo).
    Backend retorna Signed URLs que o frontend usa para fazer upload paralelo.
    """
    file_names: List[str] = Field(
        ...,
        description="Lista de nomes dos arquivos para upload",
        min_items=1,
        max_items=100
    )
    user_id: str = Field(
        ...,
        description="ID do usuário que está fazendo a requisição",
        min_length=1
    )
    chat_id: Optional[str] = Field(
        None,
        description="ID do chat/conversa (opcional). Quando fornecido, o backend salvará o batch_id no documento do chat."
    )
    
    class Config:
        schema_extra = {
            "example": {
                "file_names": [
                    "XPerformance_123456_Ref.29.08.pdf",
                    "XPerformance_789012_Ref.30.08.pdf"
                ],
                "user_id": "user123abc",
                "chat_id": "chat789xyz"
            }
        }

class GenerateUploadUrlsResponse(BaseModel):
    """
    Response com Signed URLs para upload direto ao GCS.
    
    Frontend usa essas URLs para fazer upload paralelo dos arquivos,
    bypassando completamente o servidor Next.js.
    """
    batch_id: str = Field(
        ...,
        description="ID único do batch (usado para identificar o grupo de arquivos)"
    )
    upload_urls: List[Dict[str, str]] = Field(
        ...,
        description="Lista de objetos com fileName, signedUrl e storagePath para cada arquivo"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "batch_id": "550e8400-e29b-41d4-a716-446655440000",
                "upload_urls": [
                    {
                        "fileName": "XPerformance_123456_Ref.29.08.pdf",
                        "signedUrl": "https://storage.googleapis.com/bucket/ultra-batch/batch_id/file.pdf?X-Goog-Algorithm=...&X-Goog-Signature=...",
                        "storagePath": "ultra-batch/550e8400-e29b-41d4-a716-446655440000/XPerformance_123456_Ref.29.08.pdf"
                    }
                ]
            }
        }


class MetricsSummaryAdoption(BaseModel):
    mau: int = 0
    mau_percent: float = 0.0


class MetricsSummaryVolume(BaseModel):
    total_analyses: int = 0


class MetricsSummaryIntensity(BaseModel):
    analyses_per_assessor_avg: float = 0.0


class MetricsSummaryQuality(BaseModel):
    ultra_batch_success_rate_pct: float = 0.0
    ultra_batch_jobs_completed_rate_pct: float = 0.0


class MetricsSummaryScale(BaseModel):
    pct_volume_ultra_batch: float = 0.0


class MetricsSummaryItem(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    closed: bool = False
    adoption: Optional[MetricsSummaryAdoption] = None
    volume: Optional[MetricsSummaryVolume] = None
    intensity: Optional[MetricsSummaryIntensity] = None
    quality: Optional[MetricsSummaryQuality] = None
    scale: Optional[MetricsSummaryScale] = None
    updated_at: Optional[Any] = None


class MetricsSummaryResponse(BaseModel):
    summaries: List[MetricsSummaryItem] = Field(
        default_factory=list,
        description="Lista de resumos mensais no intervalo solicitado",
    )
