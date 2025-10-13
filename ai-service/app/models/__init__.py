"""
Modelos de dados da aplicação.
"""
from .schema import MeetingAnalysisState, Opportunity
from .requests import (
    AnalyzeRequest,
    AnalyzeResponse,
    OpportunityResponse,
    MetadataResponse,
    ErrorResponse
)

__all__ = [
    # Estado do LangGraph
    'MeetingAnalysisState',
    'Opportunity',
    
    # Modelos Pydantic
    'AnalyzeRequest',
    'AnalyzeResponse',
    'OpportunityResponse',
    'MetadataResponse',
    'ErrorResponse',
]