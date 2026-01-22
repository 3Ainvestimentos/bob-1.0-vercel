# ai-service/app/services/report_analyzer/nodes/extract_data.py
"""
Nó para extrair dados estruturados usando LLM multimodal.
Versão otimizada com prompts separados por modo de análise.
"""
import json
import base64
import re 
from typing import Dict, Any, List
from app.models.schema import ReportAnalysisState
from app.config import GOOGLE_API_KEY, LANGCHAIN_PROJECT_REPORT, MODEL_NAME, MODEL_TEMPERATURE, get_gemini_client, generate_content_with_timeout
from app.services.report_analyzer.prompts import (
    XP_REPORT_EXTRACTION_PROMPT_OPTIMIZED,
    XP_REPORT_EXTRACTION_PROMPT_FULL
)
from app.services.report_analyzer.schemas import (
    EXTRACTED_DATA_SCHEMA_OPTIMIZED,
    EXTRACTED_DATA_SCHEMA_FULL
)
import os


def extract_data(state: ReportAnalysisState) -> Dict[str, Any]:

    print("[extract_data] 🔍 DEBUG - Iniciando extração de dados")
    """
    Extrai dados estruturados usando LLM multimodal.
    Usa prompt otimizado ou completo baseado no modo de análise.
    
    Input (do estado):
        - raw_text: str (texto extraído)
        - pdf_images: List[Dict] (imagens das páginas do PDF)
        - analysis_mode: str ("auto" | "personalized")
    
    Output (atualização do estado):
        - extracted_data: Dict (dados extraídos pelo LLM)
        - metadata: Dict (metadados da extração)
    """

    try:
        # ========== ETAPA 1: VALIDAÇÃO DE ENTRADAS ==========
        # Verifica se os dados necessários estão presentes no estado
        print(f"[extract_data] Verificando dados de entrada...")
        print(f"[extract_data] raw_text disponível: {bool(state.get('raw_text'))}")
        print(f"[extract_data] pdf_images disponível: {bool(state.get('pdf_images'))}")
        print(f"[extract_data] analysis_mode: {state.get('analysis_mode', 'auto')}")
        
        if not state.get("raw_text"):
            error_msg = "Texto bruto não disponível para extração"
            print(f"[extract_data] ❌ {error_msg}")
            return {"error": error_msg}

        if not state.get("pdf_images"):
            error_msg = "Imagens do PDF não disponíveis para extração"
            print(f"[extract_data] ❌ {error_msg}")
            return {"error": error_msg}

        # ========== ETAPA 2: DETERMINAR MODO DE ANÁLISE ==========
        # O modo determina qual prompt usar e quais campos extrair
        analysis_mode = state.get("analysis_mode", "auto")
        print(f"[extract_data] Modo de análise: {analysis_mode}")

        # ========== ETAPA 3: CONSTRUIR PROMPT ==========
        # Prompt otimizado: menos campos (sem allAssets) - mais rápido
        # Prompt completo: todos os campos (com allAssets) - mais detalhado
        if analysis_mode == "personalized" or analysis_mode == "extract_only":
            print(f"[extract_data] Usando prompt completo (com allAssets)")
            prompt = _build_full_extraction_prompt(
                state["raw_text"], 
                state["pdf_images"]
            )
        else:
            print(f"[extract_data] Usando prompt otimizado (sem allAssets)")
            prompt = _build_optimized_extraction_prompt(
                state["raw_text"], 
                state["pdf_images"]
            )

        # ========== ETAPA 4: PREPARAR CONTEÚDO MULTIMODAL ==========
        # O Gemini pode processar texto + imagens simultaneamente
        content_parts = [prompt] # Primeiro elemento é sempre o prompt de texto
        
        # Adicionar imagens do PDF
        for img_data in state["pdf_images"]:
            try:
                # Converter imagem para base64
                if isinstance(img_data["image_data"], bytes):
                    image_b64 = base64.b64encode(img_data["image_data"]).decode()
                else:
                    # Se já for base64
                    image_b64 = img_data["image_data"]
                
                content_parts.append({
                    "mime_type": "image/png",
                    "data": image_b64
                })
                
                print(f"[extract_data] ✅ Imagem da página {img_data['page']} adicionada")
                
            except Exception as e:
                print(f"[extract_data] ⚠️ Erro ao processar imagem da página {img_data.get('page', '?')}: {e}")
                continue

        #os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT_REPORT

        # 5. Chamar LLM multimodal via LangChain
        #llm = get_llm()

        print(f"[extract_data] Chamando LLM multimodal com {len(content_parts)-1} imagens...")

        # ========== ETAPA 5: PREPARAR FORMATO PARA GEMINI SDK ==========
        # Converter formato intermediário para formato do Gemini SDK
        message_content = [
            {"type": "text", "text": content_parts[0]}  # Primeiro é o prompt
        ]

        # Adicionar imagens
        for part in content_parts[1:]:
            message_content.append({
                "type": "image_url",
                "image_url": f"data:{part['mime_type']};base64,{part['data']}"
            })

        # Chamar LLM via Langchain
        #response = llm.invoke([HumanMessage(content=message_content)])

        text_content = ""
        images = []

        for item in message_content:
            if item.get("type") == "text":
                text_content += item.get("text", "")
            elif item.get("type") == "image_url":
                image_data = item.get('image_url', '').replace('data:image/png;base64,', '')
                images.append(image_data)

         # ========== ETAPA 6: CHAMAR GEMINI SDK ==========
        try:
            client = get_gemini_client()
            print(f"[extract_data] 🔍 DEBUG - Cliente Gemini criado com sucesso")
        except Exception as e:
            print(f"[extract_data] ❌ Erro ao criar cliente Gemini: {e}")
            return {"error": f"Erro ao criar cliente Gemini: {str(e)}"}

        # Selecionar schema baseado no modo de análise
        if analysis_mode == "personalized" or analysis_mode == "extract_only":
            json_schema = EXTRACTED_DATA_SCHEMA_FULL
            print(f"[extract_data] Usando schema FULL (personalizado)")
        else:
            json_schema = EXTRACTED_DATA_SCHEMA_OPTIMIZED
            print(f"[extract_data] Usando schema OPTIMIZED (automático)")

        # Se há imagens, usar formato multimodal
        if images:
            print(f"[extract_data] Processando {len(images)} imagens + texto")
            
            # Formato correto para multimodal - uma única mensagem com texto e imagens
            parts = []
            
            # Adicionar texto primeiro
            if text_content:
                parts.append({"text": text_content})
            
            # Adicionar imagens
            for img_data in images:
                parts.append({
                    "inline_data": {
                        "mime_type": "image/png",
                        "data": img_data
                    }
                })
            
            contents = [{
                "role": "user",
                "parts": parts
            }]
            
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=contents,
                config={
                "temperature": 0.1,
                "max_output_tokens": 10000,
                "response_mime_type": "application/json",
                "response_json_schema": json_schema
            }
            )
        else:
            print("[extract_data] Processando apenas texto")
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=contents,
                config={
                "temperature": 0.1,
                "max_output_tokens": 10000,
                "response_mime_type": "application/json",
                "response_json_schema": json_schema
            }
            )

        # ========== ETAPA 7: VALIDAR RESPOSTA ==========
        if not response or not response.text:
            error_msg = "LLM retornou resposta vazia"
            print(f"[extract_data] ❌ {error_msg}")
            return {"error": error_msg}

        print(f"[extract_data] ✅ LLM respondeu com {len(response.text)} caracteres")

        # ========== ETAPA 8: LIMPAR RESPOSTA ==========
        # Remove markdown, texto extra, e isola o JSON
        cleaned_response = _clean_llm_response(response.text)
        
        # ✅ Validar se a limpeza retornou algo válido
        if not cleaned_response:
            print(f"[extract_data] ⚠️ Limpeza retornou string vazia, tentando usar resposta original")
            cleaned_response = response.text.strip()
        
        # 7. Parsear JSON
        try:
            extracted_data = json.loads(cleaned_response)
        except json.JSONDecodeError as e:
            error_msg = f"Erro ao parsear JSON (mesmo com structured output): {str(e)}"
            print(f"[extract_data] ❌ {error_msg}")
            print(f"[extract_data] 🔍 Resposta recebida (primeiros 500 chars): {response.text[:500]}")
            # ✅ Tentar reparar JSON comum (strings não escapadas)
            try:
                # Tentar escapar caracteres problemáticos
                repaired = cleaned_response.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                # Tentar encontrar e fechar strings não terminadas
                # (lógica mais complexa seria necessária aqui)
                extracted_data = json.loads(repaired)
                print(f"[extract_data] ✅ JSON reparado com sucesso")
            except:
                return {"error": error_msg}

        # 8. Validar dados extraídos
        validation_result = _validate_extracted_data(extracted_data, analysis_mode)
        if validation_result.get("error"):
            print(f"[extract_data] ⚠️ {validation_result['error']}")
            # Continuar mesmo com warnings de validação

        # 9. Retornar resultado
        result = {
            "extracted_data": extracted_data,
            "metadata": {
                "extraction_mode": analysis_mode,
                "prompt_used": "full" if (analysis_mode == "personalized" or analysis_mode == "extract_only") else "optimized",  
                "response_length": len(response.text),
                "fields_extracted": len(extracted_data),
                "images_processed": len(content_parts) - 1,
                "validation_warnings": validation_result.get("warnings", [])
            }
        }

        print(f"[extract_data] ✅ Extração concluída: {len(extracted_data)} campos extraídos, {len(content_parts)-1} imagens processadas")

        print(f"[extract_data]: {(extracted_data)}")
        return result



    except Exception as e:
        error_msg = f"Erro na extração de dados: {str(e)}"
        print(f"[extract_data] ❌ {error_msg}")
        import traceback
        print(f"[extract_data] ❌ Traceback: {traceback.format_exc()}")
        return {"error": error_msg}


def _build_optimized_extraction_prompt(raw_text: str, pdf_images: List[Dict]) -> str:
    """
    Constrói prompt otimizado para análise automática (sem allAssets).
    """
    # Preparar contexto das imagens
    images_context = f"**IMAGENS DISPONÍVEIS:** {len(pdf_images)} páginas do PDF para análise visual."
    
    # Usar prompt otimizado
    prompt = XP_REPORT_EXTRACTION_PROMPT_OPTIMIZED.format(
        raw_text=raw_text,
        images_context=images_context
    )
    
    return prompt


def _build_full_extraction_prompt(raw_text: str, pdf_images: List[Dict]) -> str:
    """
    Constrói prompt completo para análise personalizada (com allAssets).
    """
    # Preparar contexto das imagens
    images_context = f"**IMAGENS DISPONÍVEIS:** {len(pdf_images)} páginas do PDF para análise visual."
    
    # Usar prompt completo
    prompt = XP_REPORT_EXTRACTION_PROMPT_FULL.format(
        raw_text=raw_text,
        images_context=images_context
    )
    
    return prompt


def _clean_llm_response(response_text: str) -> str:
    """
    Limpa a resposta do LLM removendo markdown e texto extra.
    Suporta tanto objetos JSON ({...}) quanto arrays JSON ([...]).
    
    Returns:
        str: JSON limpo ou string vazia se inválido
    """
    # ========== VALIDAÇÃO INICIAL ==========
    if not response_text or not response_text.strip():
        print("[extract_data] ⚠️ Resposta do LLM está vazia")
        return ""
    
    # ========== REMOVER MARKDOWN CODE BLOCKS ==========
    if "```json" in response_text:
        start = response_text.find("```json") + 7
        end = response_text.find("```", start)
        if end != -1:
            response_text = response_text[start:end].strip()
    elif "```" in response_text:
        start = response_text.find("```") + 3
        end = response_text.find("```", start)
        if end != -1:
            response_text = response_text[start:end].strip()
    
    # ========== ENCONTRAR INÍCIO DO JSON ==========
    # Procurar por { (objeto) ou [ (array)
    first_brace = response_text.find("{")
    first_bracket = response_text.find("[")
    
    # Determinar qual vem primeiro e qual tipo de JSON é
    if first_brace == -1 and first_bracket == -1:
        print(f"[extract_data] ⚠️ Não encontrou '{{' ou '[' na resposta.")
        print(f"[extract_data] 🔍 Primeiros 200 chars: {response_text[:200]}")
        return ""
    
    # Usar o que vier primeiro
    if first_bracket != -1 and (first_brace == -1 or first_bracket < first_brace):
        # É um array JSON
        start_char = '['
        end_char = ']'
        first_char_pos = first_bracket
        json_type = "array"
    else:
        # É um objeto JSON
        start_char = '{'
        end_char = '}'
        first_char_pos = first_brace
        json_type = "objeto"
    
    response_text = response_text[first_char_pos:]
    
    # ========== ENCONTRAR FIM DO JSON (CHAVES/COLCHETES BALANCEADOS) ==========
    count = 0
    last_valid_pos = -1
    
    for i, char in enumerate(response_text):
        if char == start_char:
            count += 1
        elif char == end_char:
            count -= 1
            if count == 0:
                last_valid_pos = i
                break
    
    # Validar se encontrou JSON completo (balanceado)
    if last_valid_pos == -1:
        print(f"[extract_data] ⚠️ JSON incompleto ({json_type} não balanceado).")
        print(f"[extract_data] 🔍 Primeiros 200 chars: {response_text[:200]}")
        return ""
    
    cleaned = response_text[:last_valid_pos + 1].strip()
    
    # ========== VALIDAÇÃO FINAL ==========
    if not cleaned:
        print("[extract_data] ⚠️ String vazia após limpeza")
        return ""
    
    return cleaned

def _validate_extracted_data(data: Dict[str, Any], analysis_mode: str) -> Dict[str, Any]:
    """
    Valida dados extraídos e retorna warnings/erros.
    """
    warnings = []
    
    # Campos obrigatórios
    required_fields = [
        "accountNumber", "reportMonth", "grossEquity", "monthlyReturn", "monthlyCdi", 
        "monthlyGain", "yearlyReturn", "yearlyCdi", "yearlyGain",
        "benchmarkValues", "classPerformance", "highlights", "detractors"
    ]
    
    # Verificar campos obrigatórios
    for field in required_fields:
        if field not in data:
            warnings.append(f"Campo obrigatório '{field}' não encontrado")
    
    # Verificar campo específico do modo
    if (analysis_mode == "personalized" or analysis_mode == "extract_only") and "allAssets" not in data:
        warnings.append("Campo 'allAssets' obrigatório para análise personalizada não encontrado")
    
    # Verificar estrutura dos highlights/detractors
    if "highlights" in data and "detractors" in data:
        # Verificar se há classes em ambos (possível erro de classificação)
        highlights_classes = set(data["highlights"].keys()) if isinstance(data["highlights"], dict) else set()
        detractors_classes = set(data["detractors"].keys()) if isinstance(data["detractors"], dict) else set()
        
        overlap = highlights_classes.intersection(detractors_classes)
        if overlap:
            warnings.append(f"Classes duplicadas em highlights e detractors: {list(overlap)}")
    
    return {
        "warnings": warnings,
        "error": warnings[0] if len(warnings) > 5 else None  # Muitos warnings = erro
    }