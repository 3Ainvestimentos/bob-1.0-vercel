"""
Nó de processamento paralelo de chunks com LLM (Map).
"""
import asyncio
import json
from typing import Dict, Any, List
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from app.models.schema import MeetingAnalysisState, Opportunity
from app.services.meeting_analyzer.prompts import MAP_PROMPT
from app.config import GOOGLE_API_KEY, MODEL_NAME, MODEL_TEMPERATURE


def map_chunks(state: MeetingAnalysisState) -> Dict[str, Any]:
    """
    Processa cada chunk com o Gemini para extrair resumo e oportunidades.
    
    Input (do estado):
        - chunks: List[str] (lista de pedaços de texto)
    
    Output (atualiza o estado):
        - partial_summaries: List[str]
        - partial_opportunities: List[List[Opportunity]]
    
    Estratégia:
        - Processa todos os chunks EM PARALELO usando asyncio
        - Cada chunk é enviado ao Gemini com o MAP_PROMPT
        - Resultados são coletados e retornados
    """
    print(f"[map_chunks] Iniciando processamento de {len(state['chunks'])} chunks")
    
    try:
        chunks = state['chunks']
        
        if not chunks:
            raise ValueError("Lista de chunks está vazia")
        
        # Inicializar o modelo Gemini
        llm = ChatGoogleGenerativeAI(
            model=MODEL_NAME,
            temperature=MODEL_TEMPERATURE,
            google_api_key=GOOGLE_API_KEY,
        )
        
        # Função assíncrona para processar um chunk
        async def process_chunk(chunk: str, index: int) -> Dict[str, Any]:
            """Processa um único chunk."""
            print(f"  [map_chunks] Processando chunk {index + 1}...")
            
            # Formatar o prompt com o texto do chunk
            prompt = MAP_PROMPT.format(chunk_text=chunk)
            
            # Chamar o Gemini
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            
            # Extrair o JSON da resposta
            response_text = response.content.strip()
            
            # Limpar markdown code blocks se existirem
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "").replace("```", "").strip()
            elif response_text.startswith("```"):
                response_text = response_text.replace("```", "").strip()
            
            # Parse do JSON
            result = json.loads(response_text)
            
            print(f"  [map_chunks] ✅ Chunk {index + 1}: {len(result['opportunities'])} oportunidades")
            
            return {
                "summary": result.get("summary", ""),
                "opportunities": result.get("opportunities", [])
            }
        
        # Processar todos os chunks em paralelo
        async def process_all_chunks():
            tasks = [process_chunk(chunk, i) for i, chunk in enumerate(chunks)]
            return await asyncio.gather(*tasks)
        
        # Executar o processamento paralelo
        results = asyncio.run(process_all_chunks())
        
        # Separar resumos e oportunidades
        partial_summaries = [r["summary"] for r in results]
        partial_opportunities = [r["opportunities"] for r in results]
        
        total_opportunities = sum(len(opps) for opps in partial_opportunities)
        print(f"[map_chunks] ✅ Processamento concluído: {total_opportunities} oportunidades totais")
        
        # Retornar atualização do estado
        return {
            "partial_summaries": partial_summaries,
            "partial_opportunities": partial_opportunities,
            "metadata": {
                **state.get('metadata', {}),
                "chunks_processed": len(chunks),
                "total_partial_opportunities": total_opportunities,
            }
        }
    
    except json.JSONDecodeError as e:
        error_msg = f"Erro ao fazer parse do JSON retornado pelo LLM: {str(e)}"
        print(f"[map_chunks] ❌ {error_msg}")
        return {"error": error_msg}
    
    except Exception as e:
        error_msg = f"Erro ao processar chunks com LLM: {str(e)}"
        print(f"[map_chunks] ❌ {error_msg}")
        return {"error": error_msg}
