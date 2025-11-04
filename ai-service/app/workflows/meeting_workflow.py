"""
Definição do workflow de análise de reuniões usando LangGraph.
"""
from langgraph.graph import StateGraph, END
from app.models.schema import MeetingAnalysisState
from app.services.meeting_analyzer import (
    extract_text,
    chunk_text,
    map_chunks,
    reduce_results
)


def create_meeting_analysis_workflow():
    """
    Cria o grafo completo de análise de reuniões.
    
    Fluxo completo (MapReduce):
        START → extract_text → chunk_text → map_chunks → reduce_results → END
    """
    
    # Criar o grafo
    workflow = StateGraph(MeetingAnalysisState)
    
    # Adicionar TODOS os nós
    workflow.add_node("extract_text", extract_text)
    workflow.add_node("chunk_text", chunk_text)
    workflow.add_node("map_chunks", map_chunks)
    workflow.add_node("reduce_results", reduce_results)
    
    # Definir entrada
    workflow.set_entry_point("extract_text")
    
    # Definir transições (pipeline completo)
    workflow.add_edge("extract_text", "chunk_text")
    workflow.add_edge("chunk_text", "map_chunks")
    workflow.add_edge("map_chunks", "reduce_results")
    workflow.add_edge("reduce_results", END)
    
    # Compilar
    return workflow.compile()

# Exportar aplicação compilada
meeting_analysis_app = create_meeting_analysis_workflow()