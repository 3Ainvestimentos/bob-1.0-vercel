# ai-service/app/services/report_analyzer/tests/test_modes_extraction.py
"""
Teste dos dois modos de extração: otimizado e completo.
"""
import sys
import json
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.append(str(Path(__file__).parent.parent.parent.parent.parent))

from app.services.report_analyzer.nodes.extract_pdf import extract_pdf
from app.services.report_analyzer.nodes.extract_data import extract_data
from app.models.schema import ReportAnalysisState


def test_extraction_modes():
    """
    Testa ambos os modos de extração com o mesmo PDF.
    """
    print("🧪 TESTE DOS MODOS DE EXTRAÇÃO")
    print("=" * 50)
    
    # 1. Configurar arquivo de teste
    pdf_path = Path(__file__).parent / "XPerformance - 5629450 - Ref.29.08 (1).pdf"
    
    if not pdf_path.exists():
        print(f"❌ Arquivo PDF não encontrado: {pdf_path}")
        return
    
    # 2. Ler arquivo PDF
    with open(pdf_path, "rb") as f:
        file_content = base64.b64encode(f.read()).decode()
    
    # 3. Estado inicial comum
    base_state = {
        "file_content": file_content,
        "file_name": pdf_path.name,
        "user_id": "test_user",
        "raw_text": "",
        "pdf_images": []
    }
    
    print(f"📄 PDF carregado: {pdf_path.name}")
    print(f"📊 Tamanho: {len(file_content)} bytes (base64)")
    
    # 4. Extrair PDF (comum para ambos os testes)
    print("\n🔍 EXTRAINDO PDF...")
    pdf_result = extract_pdf(base_state)
    
    if "error" in pdf_result:
        print(f"❌ Erro na extração do PDF: {pdf_result['error']}")
        return
    
    print(f"✅ PDF extraído:")
    print(f"   - Texto: {pdf_result['metadata']['text_length']} caracteres")
    print(f"   - Imagens: {len(pdf_result['pdf_images'])} páginas")
    
    # 5. Testar MODO OTIMIZADO
    print("\n" + "="*50)
    print("🟢 TESTE MODO OTIMIZADO (análise automática)")
    print("="*50)
    
    optimized_state = {
        **base_state,
        **pdf_result,
        "analysis_mode": "auto"
    }
    
    optimized_result = extract_data(optimized_state)
    
    if "error" in optimized_result:
        print(f"❌ Erro na extração otimizada: {optimized_result['error']}")
    else:
        print(f"✅ Extração otimizada concluída:")
        print(f"   - Modo: {optimized_result['metadata']['extraction_mode']}")
        print(f"   - Prompt: {optimized_result['metadata']['prompt_used']}")
        print(f"   - Campos: {optimized_result['metadata']['fields_extracted']}")
        print(f"   - Imagens processadas: {optimized_result['metadata']['images_processed']}")
        print(f"   - Tempo resposta: {optimized_result['metadata']['response_length']} chars")
        
        # Verificar se tem allAssets
        has_all_assets = "allAssets" in optimized_result["extracted_data"]
        print(f"   - Tem allAssets: {'✅ SIM' if has_all_assets else '❌ NÃO'}")
        
        # Salvar resultado
        output_file = Path(__file__).parent / f"optimized_results_{pdf_path.stem}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump({
                "metadata": optimized_result["metadata"],
                "extracted_data": optimized_result["extracted_data"]
            }, f, indent=2, ensure_ascii=False)
        print(f"   - Salvo em: {output_file.name}")
    
    # 6. Testar MODO COMPLETO
    print("\n" + "="*50)
    print("🔴 TESTE MODO COMPLETO (análise personalizada)")
    print("="*50)
    
    full_state = {
        **base_state,
        **pdf_result,
        "analysis_mode": "personalized"
    }
    
    full_result = extract_data(full_state)
    
    if "error" in full_result:
        print(f"❌ Erro na extração completa: {full_result['error']}")
    else:
        print(f"✅ Extração completa concluída:")
        print(f"   - Modo: {full_result['metadata']['extraction_mode']}")
        print(f"   - Prompt: {full_result['metadata']['prompt_used']}")
        print(f"   - Campos: {full_result['metadata']['fields_extracted']}")
        print(f"   - Imagens processadas: {full_result['metadata']['images_processed']}")
        print(f"   - Tempo resposta: {full_result['metadata']['response_length']} chars")
        
        # Verificar se tem allAssets
        has_all_assets = "allAssets" in full_result["extracted_data"]
        print(f"   - Tem allAssets: {'✅ SIM' if has_all_assets else '❌ NÃO'}")
        
        if has_all_assets:
            all_assets = full_result["extracted_data"]["allAssets"]
            total_assets = sum(len(assets) for assets in all_assets.values())
            print(f"   - Total de ativos: {total_assets}")
            for class_name, assets in all_assets.items():
                print(f"     - {class_name}: {len(assets)} ativos")
        
        # Salvar resultado
        output_file = Path(__file__).parent / f"full_results_{pdf_path.stem}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump({
                "metadata": full_result["metadata"],
                "extracted_data": full_result["extracted_data"]
            }, f, indent=2, ensure_ascii=False)
        print(f"   - Salvo em: {output_file.name}")
    
    # 7. Comparação final
    print("\n" + "="*50)
    print("📊 COMPARAÇÃO DOS RESULTADOS")
    print("="*50)
    
    if "error" not in optimized_result and "error" not in full_result:
        opt_data = optimized_result["extracted_data"]
        full_data = full_result["extracted_data"]
        
        print("🔍 Campos extraídos:")
        opt_fields = set(opt_data.keys())
        full_fields = set(full_data.keys())
        
        print(f"   - Modo otimizado: {len(opt_fields)} campos")
        print(f"   - Modo completo: {len(full_fields)} campos")
        print(f"   - Diferença: {len(full_fields - opt_fields)} campos")
        
        if full_fields - opt_fields:
            print(f"   - Campos extras: {list(full_fields - opt_fields)}")
        
        # Verificar highlights/detractors
        if "highlights" in opt_data and "highlights" in full_data:
            opt_highlights = len(opt_data["highlights"])
            full_highlights = len(full_data["highlights"])
            print(f"   - Highlights (otimizado): {opt_highlights}")
            print(f"   - Highlights (completo): {full_highlights}")
            
            if opt_highlights != full_highlights:
                print("   ⚠️ DIFERENÇA NOS HIGHLIGHTS!")
        
        print("\n✅ Teste concluído com sucesso!")


if __name__ == "__main__":
    import base64
    test_extraction_modes()