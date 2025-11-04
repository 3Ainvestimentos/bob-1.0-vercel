# ai-service/app/services/report_analyzer/nodes/extract_data.py
"""
Nó para extrair dados estruturados usando LLM multimodal.
Versão otimizada com prompts separados por modo de análise.
"""
import json
import base64
from typing import Dict, Any, List
from app.models.schema import ReportAnalysisState
from app.config import GOOGLE_API_KEY, LANGCHAIN_PROJECT_REPORT, MODEL_NAME, MODEL_TEMPERATURE, get_gemini_client, generate_content_with_timeout
from app.services.report_analyzer.prompts import (
    XP_REPORT_EXTRACTION_PROMPT_OPTIMIZED,
    XP_REPORT_EXTRACTION_PROMPT_FULL
)
import os


def extract_data(state: ReportAnalysisState) -> Dict[str, Any]:

    print("[extract_data] 🔍 DEBUG - INÍCIO DA FUNÇÃO")
    print(f"[extract_data] 🔍 DEBUG - GOOGLE_API_KEY disponível: {bool(os.getenv('GOOGLE_API_KEY'))}")
    print(f"[extract_data] 🔍 DEBUG - GOOGLE_API_KEY length: {len(os.getenv('GOOGLE_API_KEY', ''))}")
    print(f"[extract_data] 🔍 DEBUG - GOOGLE_API_KEY prefix: {os.getenv('GOOGLE_API_KEY', '')[:10]}...")
    print("[extract_data] Iniciando extração de dados")
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
        # 1. Verificações iniciais
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

        # 2. Determinar modo de análise
        analysis_mode = state.get("analysis_mode", "auto")
        print(f"[extract_data] Modo de análise: {analysis_mode}")

        # 3. Escolher prompt baseado no modo
        if analysis_mode == "personalized":
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

        # 4. Preparar conteúdo multimodal
        content_parts = [prompt]
        
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

        # Preparar conteúdo multimodal para LangChain
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

        #Usar SDK Gemini em vez do Langchain
        try:
            client = get_gemini_client()
            print(f"[extract_data] 🔍 DEBUG - Cliente Gemini criado com sucesso")
        except Exception as e:
            print(f"[extract_data] ❌ Erro ao criar cliente Gemini: {e}")
            return {"error": f"Erro ao criar cliente Gemini: {str(e)}"}

    # Substitua as linhas 130-152 por:
# Substitua as linhas 130-168 por:
        # Substitua as linhas 132-163 por:
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
                "temperature": 0.2,
                "max_output_tokens": 8192 
            }
            )
        else:
            print("[extract_data] Processando apenas texto")
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=text_content
            )

        if not response or not response.text:
            error_msg = "LLM retornou resposta vazia"
            print(f"[extract_data] ❌ {error_msg}")
            return {"error": error_msg}

        print(f"[extract_data] ✅ LLM respondeu com {len(response.text)} caracteres")

        # 6. Limpar resposta (remover markdown se presente)
        cleaned_response = _clean_llm_response(response.text)
        
        # 7. Parsear JSON
        try:
            extracted_data = json.loads(cleaned_response)
        except json.JSONDecodeError as e:
            error_msg = f"Erro ao parsear JSON: {str(e)}"
            print(f"[extract_data] ❌ {error_msg}")
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
                "prompt_used": "full" if analysis_mode == "personalized" else "optimized",
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
    """
    # Remover markdown code blocks
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
    
    # Remover texto antes do primeiro {
    first_brace = response_text.find("{")
    if first_brace != -1:
        response_text = response_text[first_brace:]
    
    # Remover texto antes do primeiro {
    first_brace = response_text.find("{")
    if first_brace == -1:
        return ""
    
    response_text = response_text[first_brace:]
    
    # NOVA LÓGICA: Contar chaves para encontrar o JSON completo
    brace_count = 0
    last_valid_brace = -1
    
    for i, char in enumerate(response_text):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                last_valid_brace = i
                break
    
    if last_valid_brace != -1:
        response_text = response_text[:last_valid_brace + 1]
    
    return response_text.strip()

def _validate_extracted_data(data: Dict[str, Any], analysis_mode: str) -> Dict[str, Any]:
    """
    Valida dados extraídos e retorna warnings/erros.
    """
    warnings = []
    
    # Campos obrigatórios
    required_fields = [
        "accountNumber", "reportMonth", "monthlyReturn", "monthlyCdi", 
        "monthlyGain", "yearlyReturn", "yearlyCdi", "yearlyGain",
        "benchmarkValues", "classPerformance", "highlights", "detractors"
    ]
    
    # Verificar campos obrigatórios
    for field in required_fields:
        if field not in data:
            warnings.append(f"Campo obrigatório '{field}' não encontrado")
    
    # Verificar campo específico do modo
    if analysis_mode == "personalized" and "allAssets" not in data:
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