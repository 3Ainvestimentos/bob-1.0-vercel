# ai-service/app/services/report_analyzer/tests/test_report_extraction.py
"""
Teste da extração multimodal (texto + imagens).
"""
import sys
import json
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from app.services.report_analyzer.nodes.extract_pdf import extract_pdf
from app.services.report_analyzer.nodes.extract_data import extract_data
from app.models.schema import ReportAnalysisState


def test_multimodal_extraction():
    """Testa a extração multimodal completa."""
    
    # 1. Preparar arquivo de teste
    pdf_path = Path(__file__).parent / "XPerformance - 5629450 - Ref.29.08 (1).pdf"
    
    if not pdf_path.exists():
        print("❌ Arquivo PDF não encontrado!")
        return
    
    # 2. Ler arquivo e converter para base64
    with open(pdf_path, 'rb') as f:
        file_bytes = f.read()
    
    import base64
    file_base64 = base64.b64encode(file_bytes).decode()
    
    # 3. Estado inicial
    initial_state: ReportAnalysisState = {
        "file_name": pdf_path.name,
        "file_content": file_base64,
        "user_id": "test_user",
        "analysis_mode": "extract_only",
        "selected_fields": None,
        "raw_text": "",
        "pdf_images": None,
        "extracted_data": {},
        "performance_analysis": "",
        "highlights": [],
        "detractors": [],
        "final_message": "",
        "metadata": {},
        "error": None
    }
    
    print("🔍 Testando extração multimodal...")
    print(f"📄 Arquivo: {pdf_path.name}")
    
    # 4. Testar extração de PDF
    print("\n📄 Executando extração de PDF...")
    pdf_result = extract_pdf(initial_state)
    
    if "error" in pdf_result:
        print(f"❌ Erro na extração de PDF: {pdf_result['error']}")
        return
    
    print("✅ Extração de PDF concluída!")
    print(f"   - Texto extraído: {pdf_result['metadata']['text_length']} caracteres")
    print(f"   - Imagens geradas: {pdf_result['metadata']['images_count']} páginas")
    
    # 5. Atualizar estado
    updated_state = {**initial_state, **pdf_result}
    
    # 6. Testar extração de dados (apenas se GOOGLE_API_KEY estiver definida)
    import os
    if not os.getenv("GOOGLE_API_KEY"):
        print("\n⚠️ GOOGLE_API_KEY não definida, pulando extração de dados")
        print("💾 Salvando apenas resultados da extração de PDF...")
        
        data_result = {"skipped": "GOOGLE_API_KEY not set"}
    else:
        print("\n🤖 Executando extração de dados com LLM multimodal...")
        data_result = extract_data(updated_state)
        
        if "error" in data_result:
            print(f"❌ Erro na extração de dados: {data_result['error']}")
        else:
            print("✅ Extração de dados concluída!")
            print(f"   - Campos extraídos: {len(data_result['extracted_data'])}")
            print(f"   - Imagens processadas: {data_result['metadata']['images_processed']}")
    
    # 7. Salvar resultados (sem dados binários)
    output_file = Path(__file__).parent / f"multimodal_results_{pdf_path.stem}.json"
    
    results_clean = {
        "pdf_extraction": {
            "raw_text": pdf_result["raw_text"],
            "metadata": pdf_result["metadata"],
            "images_count": len(pdf_result.get("pdf_images", []))
        },
        "data_extraction": data_result
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results_clean, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Resultados salvos em: {output_file}")
    
    # 8. Mostrar resumo
    print("\n📊 RESUMO:")
    print(f"   - Texto extraído: {pdf_result['metadata']['text_length']} caracteres")
    print(f"   - Imagens geradas: {pdf_result['metadata']['images_count']} páginas")
    
    if "extracted_data" in data_result:
        extracted = data_result["extracted_data"]
        print(f"   - Campos extraídos: {len(extracted)}")
        
        # Verificar sinais negativos
        if "benchmarkValues" in extracted:
            benchmarks = extracted["benchmarkValues"]
            print("   - Benchmarks extraídos:")
            for key, value in benchmarks.items():
                status = "✅" if str(value).startswith('-') else "❌"
                print(f"     {status} {key}: {value}")
    
    return results_clean


if __name__ == "__main__":
    test_multimodal_extraction()