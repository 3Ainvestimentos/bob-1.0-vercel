"""
Workflow de análise de relatórios XP usando LangGraph.
"""
import os
from langgraph.graph import StateGraph, END
from app.models.schema import ReportAnalysisState
from app.config import LANGCHAIN_PROJECT_REPORT
from app.services.report_analyzer.nodes import (
    extract_pdf,
    extract_data,
    analyze_report,
    format_message_auto,
    format_message_custom
)


def create_report_analysis_workflow():
    """
    Cria o grafo completo de análise de relatórios XP.
    
    Modos:
    - extract_only: extract_pdf → extract_data → END
    - auto: extract_pdf → extract_data → analyze_report → format_message_auto → END
    - personalized: extract_pdf → extract_data → analyze_report → format_message_custom → END
    - batch: Múltiplos arquivos processados em paralelo
    """
     # Limpar estado anterior (se existir)
    if "LANGCHAIN_PROJECT" in os.environ:
        del os.environ["LANGCHAIN_PROJECT"]
    
    # Configurar para este request específico
    os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT_REPORT
    print(f"[report_workflow] Configurado projeto LangSmith: {LANGCHAIN_PROJECT_REPORT}")
    
     # Criar o grafo
    workflow = StateGraph(ReportAnalysisState)
    
    # Adicionar nós
    workflow.add_node("extract_pdf", extract_pdf)
    workflow.add_node("extract_data", extract_data)
    workflow.add_node("analyze_report", analyze_report)
    workflow.add_node("format_message_auto", format_message_auto)
    
    # Definir ponto de entrada
    workflow.set_entry_point("extract_pdf")
    
    # Transições fixas
    workflow.add_edge("extract_pdf", "extract_data")
    
    
    # Roteamento após extração
    def route_after_extraction(state: ReportAnalysisState) -> str:
        mode = state.get("analysis_mode", "auto")
        if mode == "extract_only":
            return END
        if mode == "personalized":
            return END
        return "analyze_report"
    
    workflow.add_conditional_edges(
        "extract_data", 
        route_after_extraction,
        {
            "analyze_report": "analyze_report",
            END: END
        }
    )
    
    # Roteamento após análise
    def route_after_analysis(state: ReportAnalysisState) -> str:
        mode = state.get("analysis_mode", "auto")
        if mode == "personalized":
            return END
        return "format_message_auto"
    
    workflow.add_conditional_edges(
        "analyze_report",
        route_after_analysis,
        {
            "format_message_auto": "format_message_auto",
            END: END
        }
    )
    
    # Transições finais
    workflow.add_edge("format_message_auto", END)
    
    
    # Compilar
    # Compilar
    compiled_workflow = workflow.compile()
    
    # ✅ LIMPAR ESTADO APÓS COMPILAÇÃO
    if "LANGCHAIN_PROJECT" in os.environ:
        del os.environ["LANGCHAIN_PROJECT"]
    
    return compiled_workflow



# No arquivo ai-service/app/workflows/report_workflow.py, adicionar nova função:
def create_report_analysis_workflow_from_data():
    """
    Cria workflow que pula extração (dados já extraídos).
    """
    workflow = StateGraph(ReportAnalysisState)
    
    # Adicionar apenas nós de formatação
    workflow.add_node("format_message_auto", format_message_auto)
    workflow.add_node("format_message_custom", format_message_custom)
    
    # Definir ponto de entrada
    workflow.set_entry_point("format_message_custom")
    
    # Transição final
    workflow.add_edge("format_message_custom", END)
    
    return workflow.compile()