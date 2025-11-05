"""
Nó de consolidação de resultados (Reduce).
"""
import json
from typing import Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from app.models.schema import MeetingAnalysisState, Opportunity
from app.services.meeting_analyzer.prompts import REDUCE_PROMPT
from app.config import GOOGLE_API_KEY, MODEL_NAME, MODEL_TEMPERATURE, LANGCHAIN_PROJECT_MEETING
import os

def reduce_results(state: MeetingAnalysisState) -> Dict[str, Any]:
    """
    Consolida todos os resumos e oportunidades parciais em um resultado final.
    
    Input (do estado):
        - partial_summaries: List[str]
        - partial_opportunities: List[List[Opportunity]]
    
    Output (atualiza o estado):
        - final_summary: str
        - final_opportunities: List[Opportunity]
    
    Estratégia:
        - Combina todos os resultados parciais em um único prompt
        - Envia ao Gemini para consolidação inteligente
        - Remove duplicatas e ordena por prioridade
    """
    print(f"[reduce_results] Consolidando resultados...")
    
    try:
        partial_summaries = state['partial_summaries']
        partial_opportunities = state['partial_opportunities']
        
        if not partial_summaries:
            raise ValueError("Lista de resumos parciais está vazia")
        
        # Formatar os resultados parciais em texto estruturado
        formatted_results = ""
        
        for i, (summary, opps) in enumerate(zip(partial_summaries, partial_opportunities)):
            formatted_results += f"\n\n### TRECHO {i + 1}:\n"
            formatted_results += f"**Resumo:** {summary}\n"
            formatted_results += f"**Oportunidades:** {len(opps)}\n"
            
            for opp in opps:
                formatted_results += f"\n- Título: {opp.get('title', 'N/A')}\n"
                formatted_results += f"  Descrição: {opp.get('description', 'N/A')}\n"
                formatted_results += f"  Prioridade: {opp.get('priority', 'N/A')}\n"
                formatted_results += f"  Menções: {opp.get('mentions', [])}\n"

        # Definir projeto LangSmith para este workflow
        os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT_MEETING
        
        # Inicializar o modelo
        llm = ChatGoogleGenerativeAI(
            model=MODEL_NAME,
            temperature=MODEL_TEMPERATURE,
            google_api_key=GOOGLE_API_KEY,
        )
        
        # Formatar o prompt
        prompt = REDUCE_PROMPT.format(partial_results=formatted_results)
        
        print(f"  [reduce_results] Enviando para Gemini consolidar...")
        
        # Chamar o Gemini
        response = llm.invoke([HumanMessage(content=prompt)])

        # Extrair o JSON da resposta
        response_text = response.content.strip()
        
        def clean_json_response(response_text: str) -> str:
            """Remove markdown code blocks e limpa o JSON."""
            original = response_text
            print(f"🔍 [DEBUG] JSON original: {repr(original[:100])}...")
            
            # Remover espaços e quebras de linha do início e fim
            cleaned = response_text.strip()
            
            # Casos comuns de markdown code blocks
            patterns_to_remove = [
                "```json\n",
                "```json",
                "```JSON\n", 
                "```JSON",
                "```\n",
                "```"
            ]
            
            # Remover do início
            for pattern in patterns_to_remove:
                if cleaned.startswith(pattern):
                    cleaned = cleaned[len(pattern):].strip()
                    print(f"🔍 [DEBUG] Removido início: {repr(pattern)}")
            
            # Remover do final
            for pattern in patterns_to_remove:
                if cleaned.endswith(pattern):
                    cleaned = cleaned[:-len(pattern)].strip()
                    print(f"🔍 [DEBUG] Removido final: {repr(pattern)}")
            
            # Remover qualquer ``` restante
            cleaned = cleaned.strip("`").strip()
            
            print(f"🔍 [DEBUG] JSON limpo: {repr(cleaned[:100])}...")
            return cleaned

            # Usar a função melhorada
        cleaned_response = clean_json_response(response_text)

        # Parse do JSON
        result = json.loads(cleaned_response)
        
        final_summary = result.get("final_summary", "")
        final_opportunities = result.get("opportunities", [])
        
        print(f"[reduce_results] ✅ Consolidação concluída: {len(final_opportunities)} oportunidades finais")
        
        # Retornar atualização do estado
        return {
            "final_summary": final_summary,
            "final_opportunities": final_opportunities,
            "metadata": {
                **state.get('metadata', {}),
                "final_opportunities_count": len(final_opportunities),
            }
        }
    
    except json.JSONDecodeError as e:
        error_msg = f"Erro ao fazer parse do JSON retornado pelo LLM: {str(e)}"
        print(f"[reduce_results] ❌ {error_msg}")
        return {"error": error_msg}
    
    except Exception as e:
        error_msg = f"Erro ao consolidar resultados: {str(e)}"
        print(f"[reduce_results] ❌ {error_msg}")
        return {"error": error_msg}
