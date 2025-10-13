"""
Schemas para o estado do LangGraph.
Define a estrutura de dados que flui entre os nós do grafo.
"""
from typing import TypedDict, List, Optional


class Opportunity(TypedDict):
    """
    Representa uma oportunidade de negócio identificada na reunião.
    """
    title: str
    description: str
    priority: str  # 'high', 'medium', 'low'
    clientMentions: List[str]  # Trechos relevantes da transcrição


class MeetingAnalysisState(TypedDict):
    """
    Estado compartilhado entre todos os nós do grafo de análise de reuniões.
    
    Fluxo de dados:
    1. extract_text: Popula 'raw_text'
    2. chunk_text: Popula 'chunks'
    3. map_chunks: Popula 'partial_summaries' e 'partial_opportunities'
    4. reduce_results: Popula 'final_summary' e 'final_opportunities'
    """
    # Entrada
    file_content: str  # Base64 do arquivo .docx
    file_name: str
    user_id: str
    
    # Dados extraídos
    raw_text: str  # Texto completo extraído do .docx
    
    # Processamento intermediário
    chunks: List[str]  # Texto dividido em pedaços
    partial_summaries: List[str]  # Resumo de cada chunk
    partial_opportunities: List[List[Opportunity]]  # Oportunidades por chunk
    
    # Resultados finais
    final_summary: str  # Resumo consolidado
    final_opportunities: List[Opportunity]  # Lista final de oportunidades
    
    # Metadados
    metadata: dict  # Informações sobre o processamento
    error: Optional[str]  # Mensagem de erro, se houver