"""
Nós para formatação de mensagens WhatsApp.
"""
import json
from typing import Dict, Any
from typing_extensions import final
from app.models.schema import ReportAnalysisState
from app.services.report_analyzer.prompts import (
    XP_MESSAGE_FORMAT_PROMPT_AUTO,
    XP_MESSAGE_FORMAT_PROMPT_CUSTOM
)
from app.config import GOOGLE_API_KEY, LANGCHAIN_PROJECT_REPORT, MODEL_NAME, MODEL_FLASH, MODEL_PRO, get_gemini_client
import os

def call_response_gemini(prompt: str) -> str:
    try:
        # Chamar Gemini direto do SDK
        client = get_gemini_client()

        response = client.models.generate_content(
            model = MODEL_PRO,
            contents = [{
                "parts": [{"text": prompt}]
            }]
        )
        return response.text.strip()
    except Exception as e:
        print(f"❌ Erro na chamada do Gemini: {e}")
        return ""

def format_message_auto(state: ReportAnalysisState) -> Dict[str, Any]:
    """
    Formata mensagem WhatsApp para análise automática (todos os dados).
    """
    print("[format_message_auto] Iniciando formatação de mensagem automática")
    
    # IMPORTANTE: Configurar projeto LangSmith
    #os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT_REPORT
    
    try:
        # 1. Validar dados necessários
        print(f"[format_message_auto] Validando dados...")
        print(f"[format_message_auto] extracted_data: {bool(state.get('extracted_data'))}")
        print(f"[format_message_auto] highlights: {len(state.get('highlights', []))}")
        print(f"[format_message_auto] detractors: {len(state.get('detractors', []))}")
        
        
        if not state.get('extracted_data'):
            print("[format_message_auto] ❌ extracted_data não encontrado")
            return {"error": "extracted_data não encontrado"}
        
        # 2. Ordenar highlights por diferença (maior primeiro)
        highlights = state.get('highlights', [])
        if highlights:
            def parse_difference(diff_str):
                """Converte string de diferença para float para ordenação."""
                try:
                    # Remove % e converte para float
                    return float(diff_str.replace('%', '').replace(',', '.'))
                except:
                    return 0.0
            
            highlights_sorted = sorted(
                highlights, 
                key=lambda x: parse_difference(x.get('benchmarkDifference', '0%')), 
                reverse=True
            )
            print(f"[format_message_auto] Highlights ordenados por diferença: {[h.get('className') + ' (' + str(h.get('benchmarkDifference', '0%')) + ')' for h in highlights_sorted]}")
        else:
            highlights_sorted = highlights
        
        # 3. Preparar dados para o prompt
        data_for_prompt = {
            "extracted_data": state['extracted_data'],
            "highlights": highlights_sorted,  # Usar highlights ordenados
            "detractors": state.get('detractors', [])
        }
        
        # 4. Construir prompt
        prompt = XP_MESSAGE_FORMAT_PROMPT_AUTO.format(
            highlights=json.dumps(data_for_prompt['highlights'], ensure_ascii=False),
            detractors=json.dumps(data_for_prompt['detractors'], ensure_ascii=False),
            extracted_data=json.dumps(data_for_prompt['extracted_data'], ensure_ascii=False),
            file_name=state.get('file_name', 'Relatório XP')
        )
        
        # 5. Chamar LLM via Langgraph
        #llm = get_llm()
        
        print("[format_message_auto] Chamando LLM para formatação...")

        final_message = call_response_gemini(prompt)

        if not final_message:  # ← CORRETO: string não tem .text
            return {"error": "LLM retornou resposta vazia"}
        
        print(f"[format_message_auto] ✅ Mensagem formatada ({len(final_message)} caracteres)")
        
        return {
            "final_message": final_message,
            "metadata": {
                "format_mode": "auto",
                "message_length": len(final_message),
                "highlights_ordered": len(highlights_sorted)
            }
        }
        
    except Exception as e:
        print(f"[format_message_auto] ❌ Erro: {e}")
        import traceback
        print(f"[format_message_auto] ❌ Traceback: {traceback.format_exc()}")
        return {"error": f"Erro na formatação: {str(e)}"}





def format_message_custom(state: ReportAnalysisState) -> Dict[str, Any]:
    """
    Formata mensagem WhatsApp com campos personalizados selecionados pelo usuário.
    """
    print("[format_message_custom] Iniciando formatação de mensagem personalizada")
    
    try:
        # 1. Validar dados necessários
        if not state.get('extracted_data'):
            return {"error": "extracted_data não encontrado"}
        
        selected_fields = state.get('selected_fields', {})
        if not selected_fields:
            return {
                "final_message": "Nenhum campo foi selecionado para análise personalizada.",
                "metadata": {"format_mode": "custom", "message_length": 0, "fields_selected": 0}
            }
        
        # 2. Filtrar dados baseado em selected_fields
        filtered_data = _filter_data_by_selection(
            state['extracted_data'],
            selected_fields
        )
        
        # Em ai-service/app/services/report_analyzer/nodes/format_message.py
# Substitua a linha 142 por:

        # 3. Debug antes da construção do prompt
        print(f"[format_message_custom] DEBUG - filtered_data antes do prompt:")
        print(f"  - Tipo: {type(filtered_data)}")
        print(f"  - Conteúdo: {filtered_data}")
        print(f"  - JSON serializado: {json.dumps(filtered_data, ensure_ascii=False)}")

        # 4. Construir prompt diretamente
        prompt = XP_MESSAGE_FORMAT_PROMPT_CUSTOM.format(
            extracted_data=json.dumps(filtered_data, ensure_ascii=False),
            highlights="[]",  # Sempre vazio no seu fluxo
            detractors="[]",  # Sempre vazio no seu fluxo
            file_name=state.get('file_name', 'Relatório XP')
        )

        
        print("[format_message_custom] Chamando LLM para formatação personalizada...")
        
        final_message = call_response_gemini(prompt)

        if not final_message:  # ← CORRETO: string não tem .text
            return {"error": "LLM retornou resposta vazia"}
        
        print(f"[format_message_custom] ✅ Mensagem personalizada formatada ({len(final_message)} caracteres)")
        
        return {
            "final_message": final_message,
            "metadata": {
                "format_mode": "custom",
                "message_length": len(final_message),
                "fields_selected": len(selected_fields)
            }
        }
        
    except Exception as e:
        print(f"[format_message_custom] ❌ Erro: {e}")
        return {"error": f"Erro na formatação personalizada: {str(e)}"}


def _filter_data_by_selection(
    extracted_data: Dict[str, Any],
    selected_fields: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Filtra extracted_data baseado nos campos selecionados.
    """
    filtered = {}
    
    # Sempre incluir accountNumber e reportMonth (necessários para contexto)
    if 'accountNumber' in extracted_data:
        filtered['accountNumber'] = extracted_data['accountNumber']
    if 'reportMonth' in extracted_data:
        filtered['reportMonth'] = extracted_data['reportMonth']

    # Campos top-level (booleanos simples) - REMOVER accountNumber e reportMonth daqui
    top_level_fields = [
        'monthlyReturn', 'monthlyCdi', 'monthlyGain',
        'yearlyReturn', 'yearlyCdi', 'yearlyGain'
    ]
    
    for field in top_level_fields:
        if selected_fields.get(field, False) and field in extracted_data:
            filtered[field] = extracted_data[field]
    
    # Filtrar classPerformance
    if 'classPerformance' in selected_fields and isinstance(selected_fields['classPerformance'], dict):
        selected_classes = selected_fields['classPerformance']
        if 'classPerformance' in extracted_data:
            filtered['classPerformance'] = [
                cls for cls in extracted_data['classPerformance']
                if selected_classes.get(cls['className'], False)
            ]

    # Filtrar allAssets - VERSÃO COM DEBUG DETALHADO
    if 'allAssets' in selected_fields and isinstance(selected_fields['allAssets'], dict):
        selected_assets = selected_fields['allAssets']
        print(f"[_filter_data_by_selection] DEBUG - selected_assets: {selected_assets}")
        
        if 'allAssets' in extracted_data:
            filtered['allAssets'] = {}
            for category, assets in extracted_data['allAssets'].items():
                print(f"[_filter_data_by_selection] DEBUG - Processando categoria: {category}")
                print(f"[_filter_data_by_selection] DEBUG - Assets na categoria: {len(assets)}")
                
                if category in selected_assets:
                    selected_indices = selected_assets[category]
                    print(f"[_filter_data_by_selection] DEBUG - selected_indices para {category}: {selected_indices}")
                    print(f"[_filter_data_by_selection] DEBUG - Tipo de selected_indices: {type(selected_indices)}")
                    
                    filtered_assets = []
                    for i, asset in enumerate(assets):
                        print(f"[_filter_data_by_selection] DEBUG - Verificando índice {i} (tipo: {type(i)})")
                        print(f"[_filter_data_by_selection] DEBUG - Asset: {asset}")
                        print(f"[_filter_data_by_selection] DEBUG - selected_indices.get(str(i), False): {selected_indices.get(str(i), False)}")                        
                        if selected_indices.get(str(i), False):
                            filtered_assets.append(asset)
                            print(f"[_filter_data_by_selection] DEBUG - ✅ Asset {i} incluído")
                        else:
                            print(f"[_filter_data_by_selection] DEBUG - ❌ Asset {i} excluído")
                    
                    print(f"[_filter_data_by_selection] DEBUG - filtered_assets final: {len(filtered_assets)}")
                    if filtered_assets:
                        filtered['allAssets'][category] = filtered_assets
                else:
                    print(f"[_filter_data_by_selection] DEBUG - Categoria {category} não está em selected_assets")
    return filtered