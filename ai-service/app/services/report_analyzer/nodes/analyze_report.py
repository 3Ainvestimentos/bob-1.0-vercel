"""
Nó de análise profunda de relatórios XP.
Gera insights com drill-down nos ativos drivers de cada classe.
"""
import json
import time
import asyncio
from typing import Dict, Any, Optional
from app.models.schema import ReportAnalysisState
from app.services.report_analyzer.nodes.format_message import _filter_data_by_selection, _filter_data_for_analysis
from app.services.report_analyzer.prompts import (
    XP_REPORT_ANALYSIS_PROMPT,
    XP_REPORT_ANALYSIS_PROMPT_PERSONALIZED
)
from app.services.report_analyzer.schemas import (
    ANALYSIS_SCHEMA,
    ANALYSIS_SCHEMA_PERSONALIZED
)
from app.config import (
    GOOGLE_API_KEY, 
    LANGCHAIN_PROJECT_REPORT, 
    MODEL_NAME, 
    MODEL_TEMPERATURE, 
    get_llm, 
    get_gemini_client,
    LLM_MAX_RETRIES,
    LLM_RETRY_DELAY
)
import os
from google.api_core.exceptions import ResourceExhausted

def call_response_gemini(prompt: str, json_schema: dict = None) -> str:
    try:
        print(f"[analyze_report]🔍 DEBUG - Chamando Gemini com prompt de {len(prompt)} caracteres")
        client =  get_gemini_client()

        # ✅ STRUCTURED OUTPUT conforme documentação
        config = {
            "temperature": MODEL_TEMPERATURE
        }
        
        if json_schema:
            config["response_mime_type"] = "application/json"
            config["response_json_schema"] = json_schema
            print(f"[analyze_report]🔍 Usando structured output")
        
        response = client.models.generate_content(
            model = MODEL_NAME,
            contents = [{
                "parts": [{"text": prompt}]
            }],
            config = config
        )
        # print(f"[analyze_report]🔍 DEBUG - Resposta recebida: {type(response)}")
        # print(f"[analyze_report]🔍 DEBUG - Response.text: {repr(response.text)}") 
        result = response.text.strip()
        # print(f"[analyze_report]🔍 DEBUG - Resultado final: {repr(result)}")
        return result
        
    except ResourceExhausted as e:
        # Relançar ResourceExhausted para ser tratado no nível superior com backoff
        raise e
    except Exception as e:
        print(f"❌ Erro na chamada do Gemini: {e}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        raise e  # Relançar para retry genérico se necessário

def validate_extracted_data(extracted_data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Valida se os campos obrigatórios estão presentes.
    
    Returns:
        (is_valid, error_message)
    """
    required_fields = [
        'accountNumber',
        'reportMonth',
        'benchmarkValues',
        'classPerformance'
    ]
    
    for field in required_fields:
        if field not in extracted_data or not extracted_data[field]:
            return False, f"Campo obrigatório ausente: {field}"
    
    # Validar benchmarkValues tem ao menos um benchmark
    if not isinstance(extracted_data['benchmarkValues'], dict) or len(extracted_data['benchmarkValues']) == 0:
        return False, "benchmarkValues deve conter ao menos um benchmark"
    
    # Validar classPerformance é uma lista não vazia
    if not isinstance(extracted_data['classPerformance'], list) or len(extracted_data['classPerformance']) == 0:
        return False, "classPerformance deve ser uma lista não vazia"
    
    return True, None


def parse_json_response(response_text: str) -> Optional[Dict[str, Any]]:
    # print(f"[analyze_report]🔍 DEBUG - Texto original (completo): {repr(response_text)}")
    
    # Remover markdown code blocks
    text = response_text.strip()
    # print(f"[analyze_report]🔍 DEBUG - Após strip: {repr(text)}")
    
    if text.startswith("```json"):
        text = text[7:]
        # print(f"[analyze_report]🔍 DEBUG - Após remover ```json: {repr(text)}")
    if text.startswith("```"):
        text = text[3:]
        # print(f"[analyze_report]🔍 DEBUG - Após remover ```: {repr(text)}")
    if text.endswith("```"):
        text = text[:-3]
        # print(f"[analyze_report]🔍 DEBUG - Após remover ``` final: {repr(text)}")
    
    text = text.strip()
    # print(f"[analyze_report]🔍 DEBUG - Texto final: {repr(text)}")
    
    # Se o texto estiver vazio, retornar erro
    if not text:
        print("[analyze_report]❌ DEBUG - Texto vazio após limpeza!")
        return None
    
    try:
        data = json.loads(text)
        return data
    except json.JSONDecodeError as e:
        print(f"[analyze_report]❌ JSON parse error: {e}")
        return None


def call_llm_with_retry(
    prompt: str,
    max_retries: int = LLM_MAX_RETRIES,
    simplify_on_last: bool = True,
    json_schema: dict = None 
) -> Optional[Dict[str, Any]]:
    """
    Chama o LLM com retry logic e Exponential Backoff para erro 429.
    """
    
    for attempt in range(max_retries):
        try:
            # Ajustar prompt baseado na tentativa
            if attempt == 0:
                current_prompt = prompt
            elif attempt == 1:
                current_prompt = prompt + "\n\nCRITICAL: Respond ONLY with valid JSON. No additional text."
            elif attempt == max_retries - 1 and simplify_on_last:
                current_prompt = prompt.replace(
                    "identifique os 2 ou 3 **ativos individuais**",
                    "identifique os principais ativos individuais (se disponíveis)"
                )
            else:
                current_prompt = prompt
            
            print(f"🔄 Tentativa {attempt + 1}/{max_retries} de análise...")
            
            # Chamada ao Gemini
            response_text = call_response_gemini(current_prompt, json_schema=json_schema)
            
            # Tentar parsear
            parsed = parse_json_response(response_text)
            
            if parsed:
                print(f"✅ Análise bem-sucedida na tentativa {attempt + 1}")
                return parsed
            
            # Falha de parsing (JSON inválido)
            print(f"⚠️ Falha no parsing na tentativa {attempt + 1}")
            if attempt < max_retries - 1:
                time.sleep(1)
            
        except ResourceExhausted:
            # Tratamento específico para Rate Limit (429)
            delay = LLM_RETRY_DELAY * (2 ** attempt)  # 2, 4, 8, 16...
            print(f"⚠️ Quota Excedida (429). Aguardando {delay}s antes da tentativa {attempt + 2}...")
            time.sleep(delay)
            continue
            
        except Exception as e:
            print(f"❌ Erro genérico na tentativa {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                time.sleep(1)
            continue
    
    return None

def validate_analysis_structure(analysis: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Valida se a estrutura da análise está correta.
    """
    required_keys = ['highlights', 'detractors']
    
    for key in required_keys:
        if key not in analysis:
            return False, f"Campo obrigatório ausente na análise: {key}"
    
    if not isinstance(analysis['highlights'], list):
        return False, "highlights deve ser lista"
    
    if not isinstance(analysis['detractors'], list):
        return False, "detractors deve ser lista"
    
    return True, None

def analyze_report(state: ReportAnalysisState) -> Dict[str, Any]:
    print("[analyze_report] Iniciando análise de relatório")
    """
    Analisa dados extraídos e gera insights profundos com drill-down.
    
    Input (state):
        - extracted_data: Dados estruturados do relatório
        - analysis_mode: Modo de análise ('auto', 'personalized', 'batch', 'extract_only')
    
    Output:
        - file_name: Nome do arquivo
        - highlights: Lista de classes acima do benchmark com ativos drivers
        - detractors: Lista de classes abaixo do benchmark
        - allAssets: Todos os ativos por classe (apenas para modo personalized)
        - error: Mensagem de erro (se houver)
    """
    start_time = time.time()
    
    try:
        # 1. Validar extracted_data
        print(f"[analyze_report] Validando dados de entrada...")
        extracted_data = state.get('extracted_data')
        print(f"[analyze_report] extracted_data disponível: {bool(extracted_data)}")
        
        if not extracted_data:
            print("[analyze_report] ❌ extracted_data não encontrado no state")
            return {
                'error': 'extracted_data não encontrado no state',
                'file_name': '',
                'highlights': [],
                'detractors': []
            }
        
        is_valid, error_msg = validate_extracted_data(extracted_data)
        if not is_valid:
            account_number = extracted_data.get('accountNumber', 'N/A')
            print(f"[analyze_report] ❌ Dados extraídos inválidos (accountNumber: {account_number}): {error_msg}")
            return {
                'error': f'Dados extraídos inválidos: {error_msg}',
                'file_name': '',
                'highlights': [],
                'detractors': []
            }
        
        # 2. ✅ NOVA LÓGICA: Verificar analysis_mode
        analysis_mode = state.get('analysis_mode', 'auto')
        print(f"[analyze_report] Modo de análise: {analysis_mode}")

        # 3. ✅ NOVO: Filtrar dados se modo personalizado
        if analysis_mode == "personalized":
            selected_fields = state.get('selected_fields', {})
            if selected_fields:
                print(f"[analyze_report] Filtrando dados baseado em selected_fields...")
                extracted_data = _filter_data_for_analysis(extracted_data, selected_fields)
                print(f"[analyze_report] Dados filtrados: {len(extracted_data.get('classPerformance', []))} classes selecionadas")

                # Validar que após filtragem ainda há dados suficientes
                if not extracted_data.get('classPerformance') or len(extracted_data.get('classPerformance', [])) == 0:
                    print(f"[analyze_report] ⚠️ Nenhuma classe selecionada após filtragem")
                    return {
                        'error': 'Nenhuma classe de ativo foi selecionada para análise',
                        'highlights': [],
                        'detractors': []
                    }
            else:
                print(f"[analyze_report] ⚠️ Modo personalized mas selected_fields vazio - usando todos os dados")
        
        # 3. Preparar prompt baseado no modo de análise
        extracted_data_json = json.dumps(extracted_data, indent=2, ensure_ascii=False)
        
        if analysis_mode == "personalized":
            # ✅ PROMPT PERSONALIZADO: Incluir todos os ativos
            prompt = XP_REPORT_ANALYSIS_PROMPT_PERSONALIZED.replace(
                '{{extracted_data}}',
                extracted_data_json
            )
            print(f"[analyze_report] Usando prompt PERSONALIZADO para análise completa")
        else:
            # ✅ PROMPT PADRÃO: Apenas highlights/detractors
            prompt = XP_REPORT_ANALYSIS_PROMPT.replace(
                '{{extracted_data}}',
                extracted_data_json
            )
            print(f"[analyze_report] Usando prompt PADRÃO para análise automática")

            # Selecionar schema baseado no modo de análise
        if analysis_mode == "personalized":
            json_schema = ANALYSIS_SCHEMA_PERSONALIZED
            print(f"[analyze_report] Usando schema PERSONALIZED")
        else:
            json_schema = ANALYSIS_SCHEMA
            print(f"[analyze_report] Usando schema AUTOMÁTICO")
        
        print(f"[analyze_report] Chamando LLM com prompt de {len(prompt)} caracteres")
        
        # 4. Chamar LLM com retry
        analysis = call_llm_with_retry(
            prompt=prompt,
            max_retries=LLM_MAX_RETRIES,
            simplify_on_last=True,
            json_schema=json_schema
        )
        
        if not analysis:
            print("[analyze_report] ❌ LLM retornou análise vazia após 3 tentativas")
            return {
                'error': 'Falha ao gerar análise após 3 tentativas',
                'file_name': '',
                'highlights': [],
                'detractors': []
            }
        
        print(f"[analyze_report] ✅ LLM retornou análise com {len(analysis)} campos")
        
        # 5. Validar estrutura da resposta
        is_valid, error_msg = validate_analysis_structure(analysis)
        if not is_valid:
            print(f"[analyze_report] ❌ Estrutura de análise inválida: {error_msg}")
            return {
                'error': f'Estrutura de análise inválida: {error_msg}',
                'highlights': [],
                'detractors': []
            }
        
        # 6. ✅ RETORNO CONDICIONAL baseado no modo de análise
        processing_time = time.time() - start_time
        print(f"[analyze_report] ✅ Análise concluída em {processing_time:.2f}s")
        
        if analysis_mode == "personalized":
            # ✅ Para análise personalizada, retornar TODOS os ativos
            return {
                'highlights': analysis.get('highlights', []),  # ← Usar .get() com fallback
                'detractors': analysis.get('detractors', []),  # ← Usar .get() com fallback
                'allAssets': extracted_data.get('allAssets', {}),  # ✅ TODOS OS ATIVOS
                'metadata': {
                    'analysis_time': processing_time,
                    'model_used': MODEL_NAME,
                    'analysis_mode': 'personalized'
                },
                'error': None
            }
        else:
            # ✅ Para análise automática, retornar apenas highlights/detractors
            return {
                'highlights': analysis.get('highlights', []),  # ← Usar .get() com fallback
                'detractors': analysis.get('detractors', []),  # ← Usar .get() com fallback
                'metadata': {
                    'analysis_time': processing_time,
                    'model_used': MODEL_NAME,
                    'analysis_mode': 'auto'
                },
                'error': None
            }
                    
    except Exception as e:
        print(f"[analyze_report] ❌ Erro inesperado: {e}")
        import traceback
        print(f"[analyze_report] ❌ Traceback: {traceback.format_exc()}")
        return {
            'error': f'Erro interno: {str(e)}',
            'highlights': [],
            'detractors': []
        }
