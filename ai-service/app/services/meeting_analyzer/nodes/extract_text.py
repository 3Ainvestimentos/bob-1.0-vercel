"""
Nó de extração de texto de arquivos .docx.
"""
import base64
import io
from docx import Document
from typing import Dict, Any
from app.models.schema import MeetingAnalysisState


def extract_text(state: MeetingAnalysisState) -> Dict[str, Any]:
    """
    Extrai texto de um arquivo .docx codificado em base64.
    
    Input (do estado):
        - file_content: str (data URI com base64)
        - file_name: str
    
    Output (atualiza o estado):
        - raw_text: str (texto extraído)
        - error: str (se houver erro)
    
    Fluxo:
        1. Recebe data URI em base64
        2. Decodifica para bytes
        3. Usa python-docx para extrair parágrafos
        4. Retorna texto completo
    """
    print(f"[extract_text] Iniciando extração do arquivo: {state['file_name']}")
    
    try:
        # 1. Pegar o data URI do estado
        file_content = state['file_content']
        
        # 2. Extrair apenas a parte base64 (após a vírgula)
        # Formato: "data:application/vnd...;base64,UEsDBBQA..."
        if ',' in file_content:
            base64_data = file_content.split(',', 1)[1]
        else:
            base64_data = file_content
        
        # 3. Decodificar de base64 para bytes
        file_bytes = base64.b64decode(base64_data)
        
        # 4. Criar um objeto de arquivo em memória
        file_stream = io.BytesIO(file_bytes)
        
        # 5. Usar python-docx para ler o documento
        doc = Document(file_stream)
        
        # 6. Extrair todo o texto dos parágrafos
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        raw_text = '\n\n'.join(paragraphs)
        
        # 7. Validar se extraiu algo
        if not raw_text or len(raw_text.strip()) < 50:
            raise ValueError(
                f"Texto extraído é muito curto ({len(raw_text)} chars). "
                "Verifique se o arquivo não está vazio ou corrompido."
            )
        
        print(f"[extract_text] ✅ Extraído: {len(raw_text)} caracteres, {len(paragraphs)} parágrafos")
        
        # 8. Retornar atualização do estado
        return {
            "raw_text": raw_text,
            "metadata": {
                "text_length": len(raw_text),
                "paragraphs_count": len(paragraphs),
            }
        }
    
    except Exception as e:
        error_msg = f"Erro ao extrair texto do arquivo: {str(e)}"
        print(f"[extract_text] ❌ {error_msg}")
        return {
            "error": error_msg
        }