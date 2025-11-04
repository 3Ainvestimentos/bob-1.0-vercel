# ai-service/app/services/report_analyzer/nodes/extract_pdf.py
"""
Nó para extrair texto e imagens de PDFs.
Versão multimodal com fallback automático para máxima robustez.
"""
import base64
import io
import tempfile
import os
from typing import Dict, Any, List
from app.models.schema import ReportAnalysisState
from PIL import Image

# Importações com fallback
try:
    import fitz  # PyMuPDF - Primária
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from pdf2image import convert_from_path
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

import pdfplumber  # Sempre disponível como fallback final


def extract_pdf(state: ReportAnalysisState) -> Dict[str, Any]:
    print(f"[extract_pdf] Iniciando extração multimodal do PDF: {state.get('file_name', 'unknown')}")
    
    # Decodificar base64
    file_content = state["file_content"]
    if file_content.startswith("data:"):
        file_content = file_content.split(",")[1]
    
    pdf_bytes = base64.b64decode(file_content)
    
    # ✅ MÉTODO PRINCIPAL: PyMuPDF (manter fluxo atual)
    if PYMUPDF_AVAILABLE:
        try:
            print(f"[extract_pdf] Usando PyMuPDF (método principal)...")
            result = _extract_with_pymupdf(pdf_bytes)
            if result and not result.get("error"):
                print(f"[extract_pdf] ✅ Sucesso com PyMuPDF")
                return result
            else:
                print(f"[extract_pdf] ⚠️ PyMuPDF falhou: {result.get('error', 'Erro desconhecido')}")
        except Exception as e:
            print(f"[extract_pdf] ❌ PyMuPDF erro: {str(e)}")
    
    # 🔄 FALLBACK 1: pdf2image (só se PyMuPDF falhar)
    if PDF2IMAGE_AVAILABLE:
        try:
            print(f"[extract_pdf] Fallback: tentando pdf2image...")
            result = _extract_with_pdf2image(pdf_bytes)
            if result and not result.get("error"):
                print(f"[extract_pdf] ✅ Sucesso com pdf2image (fallback)")
                return result
            else:
                print(f"[extract_pdf] ⚠️ pdf2image falhou: {result.get('error', 'Erro desconhecido')}")
        except Exception as e:
            print(f"[extract_pdf] ❌ pdf2image erro: {str(e)}")
    
    # 🔄 FALLBACK 2: pdfplumber (último recurso)
    try:
        print(f"[extract_pdf] Fallback final: tentando pdfplumber...")
        result = _extract_with_pdfplumber(pdf_bytes)
        if result and not result.get("error"):
            print(f"[extract_pdf] ✅ Sucesso com pdfplumber (fallback final)")
            return result
        else:
            print(f"[extract_pdf] ⚠️ pdfplumber falhou: {result.get('error', 'Erro desconhecido')}")
    except Exception as e:
        print(f"[extract_pdf] ❌ pdfplumber erro: {str(e)}")
    
    # Se todos falharam
    error_msg = "Todos os métodos de extração falharam"
    print(f"[extract_pdf] ❌ {error_msg}")
    return {"error": error_msg}


def _extract_with_pymupdf(pdf_bytes: bytes) -> Dict[str, Any]:
    """✅ MÉTODO PRINCIPAL: PyMuPDF (fluxo atual mantido)"""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    print(f"[extract_pdf] PDF aberto com PyMuPDF, {len(doc)} páginas")
    
    raw_text = ""
    pdf_images = []
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        
        # Extrair texto
        page_text = page.get_text()
        raw_text += f"\n--- Página {page_num + 1} ---\n{page_text}"
        
        # Converter para imagem
        try:
            mat = fitz.Matrix(1.0, 1.0)  # 1x zoom (tamanho original)
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            
            pdf_images.append({
                "page": page_num + 1,
                "image_data": base64.b64encode(img_data).decode('utf-8')
            })
            print(f"[extract_pdf] ✅ Página {page_num + 1} convertida para imagem")
            
        except Exception as e:
            print(f"[extract_pdf] ⚠️ Erro ao converter página {page_num + 1}: {e}")
            continue
    
    doc.close()
    
    if not raw_text.strip():
        return {"error": "Não foi possível extrair texto do PDF"}
    
    print(f"[extract_pdf] ✅ Extraído: {len(raw_text)} chars, {len(pdf_images)} imagens")
    
    return {
        "raw_text": raw_text.strip(),
        "pdf_images": pdf_images,
        "metadata": {
            "text_length": len(raw_text),
            "images_count": len(pdf_images),
            "extraction_method": "pymupdf_multimodal"
        }
    }


def _extract_with_pdf2image(pdf_bytes: bytes) -> Dict[str, Any]:
    """🔄 FALLBACK 1: pdf2image"""
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
        tmp_file.write(pdf_bytes)
        tmp_path = tmp_file.name
    
    try:
        images = convert_from_path(tmp_path, dpi=200, fmt='PNG', thread_count=1)
        
        raw_text = ""
        pdf_images = []
        
        for i, image in enumerate(images):
            raw_text += f"\n--- Página {i + 1} ---\n[Texto não extraído - apenas imagem]\n"
            
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            img_data = buffer.getvalue()
            
            pdf_images.append({
                "page": i + 1,
                "image_data": base64.b64encode(img_data).decode('utf-8')
            })
            print(f"[extract_pdf] ✅ Página {i + 1} convertida (pdf2image)")
        
        return {
            "raw_text": raw_text.strip(),
            "pdf_images": pdf_images,
            "metadata": {
                "text_length": len(raw_text),
                "images_count": len(pdf_images),
                "extraction_method": "pdf2image_fallback"
            }
        }
        
    finally:
        os.unlink(tmp_path)


def _extract_with_pdfplumber(pdf_bytes: bytes) -> Dict[str, Any]:
    """🔄 FALLBACK 2: pdfplumber"""
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
        tmp_file.write(pdf_bytes)
        tmp_path = tmp_file.name
    
    try:
        raw_text = ""
        pdf_images = []
        
        with pdfplumber.open(tmp_path) as pdf:
            print(f"[extract_pdf] PDF aberto com pdfplumber, {len(pdf.pages)} páginas")
            
            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                raw_text += f"\n--- Página {page_num + 1} ---\n{page_text}"
                
                try:
                    page_image = page.to_image(resolution=150)
                    img_buffer = io.BytesIO()
                    page_image.original.save(img_buffer, format='PNG')
                    img_data = img_buffer.getvalue()
                    
                    pdf_images.append({
                        "page": page_num + 1,
                        "image_data": base64.b64encode(img_data).decode('utf-8')
                    })
                    print(f"[extract_pdf] ✅ Página {page_num + 1} convertida (pdfplumber)")
                    
                except Exception as e:
                    print(f"[extract_pdf] ⚠️ Erro página {page_num + 1} (pdfplumber): {e}")
                    continue
        
        if not raw_text.strip():
            return {"error": "pdfplumber: Não foi possível extrair texto"}
        
        return {
            "raw_text": raw_text.strip(),
            "pdf_images": pdf_images,
            "metadata": {
                "text_length": len(raw_text),
                "images_count": len(pdf_images),
                "extraction_method": "pdfplumber_fallback"
            }
        }
        
    finally:
        os.unlink(tmp_path)