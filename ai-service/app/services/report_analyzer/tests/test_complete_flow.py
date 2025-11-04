"""
Teste com PDF anexado no diretório de testes.
"""
import sys
from pathlib import Path
import requests
import base64
import json
import time

# Adicionar o diretório raiz do ai-service ao path
ai_service_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.append(str(ai_service_root))

def test_with_attached_pdf():
    """Testa com PDF anexado."""
    base_url = "http://localhost:8000"
    
    # Caminho do PDF anexado
    pdf_path = Path(__file__).parent / "XPerformance - 3944254 - Ref.29.08 (3).pdf"
    
    print("🚀 TESTE COM PDF ANEXADO")
    print("=" * 50)
    print(f"📄 PDF: {pdf_path.name}")
    print(f"📁 Caminho: {pdf_path}")
    print("=" * 50)
    
    # Verificar se o PDF existe
    if not pdf_path.exists():
        print(f"❌ PDF não encontrado: {pdf_path}")
        return
    
    # 1. Converter PDF para base64
    print("1. 🔄 Convertendo PDF para base64...")
    try:
        with open(pdf_path, 'rb') as pdf_file:
            pdf_content = pdf_file.read()
            pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
        print(f"   ✅ PDF convertido: {len(pdf_base64)} caracteres")
    except Exception as e:
        print(f"   ❌ Erro ao ler PDF: {e}")
        return
    
    # 2. Testar endpoint /extract
    print("\n2. 📊 Testando extração de dados...")
    extract_data = {
        "file_content": pdf_base64,
        "file_name": pdf_path.name,
        "user_id": "test_user_real"
    }
    
    start_time = time.time()
    try:
        response = requests.post(
            f"{base_url}/api/report/extract",
            json=extract_data,
            timeout=60
        )
        extract_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ Extração bem-sucedida ({extract_time:.2f}s)")
            print(f"   📊 Success: {result.get('success')}")
            
            if result.get('extracted_data'):
                extracted = result['extracted_data']
                print(f"   📋 Campos extraídos: {len(extracted)}")
                print(f"   🔍 Campos: {list(extracted.keys())}")
                
                # Mostrar alguns campos importantes
                important_fields = ['monthlyReturn', 'yearlyReturn', 'classPerformance']
                for field in important_fields:
                    if field in extracted:
                        print(f"   📈 {field}: {extracted[field]}")
            else:
                print("   ⚠️ Nenhum dado extraído")
        else:
            print(f"   ❌ Erro na extração: {response.status_code}")
            print(f"   📄 Resposta: {response.text[:200]}")
            return
            
    except Exception as e:
        print(f"   ❌ Erro na requisição: {e}")
        return
    
    # 3. Testar endpoint /analyze-auto
    print("\n3. 🤖 Testando análise automática...")
    analyze_data = {
        "file_content": pdf_base64,
        "file_name": pdf_path.name,
        "user_id": "test_user_real"
    }
    
    start_time = time.time()
    try:
        response = requests.post(
            f"{base_url}/api/report/analyze-auto",
            json=analyze_data,
            timeout=120
        )
        analyze_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ Análise bem-sucedida ({analyze_time:.2f}s)")
            print(f"   📊 Success: {result.get('success')}")
            
            if result.get('performance_analysis'):
                print(f"   📈 Análise de performance: {len(result['performance_analysis'])} chars")
            
            if result.get('highlights'):
                highlights = result['highlights']
                print(f"   ⭐ Highlights: {len(highlights)} encontrados")
                for i, highlight in enumerate(highlights[:3]):  # Mostrar primeiros 3
                    print(f"      {i+1}. {highlight.get('className', 'N/A')}: {highlight.get('return', 'N/A')}")
            
            if result.get('detractors'):
                detractors = result['detractors']
                print(f"   ⚠️ Detractors: {len(detractors)} encontrados")
            
            if result.get('final_message'):
                message = result['final_message']
                print(f"   📝 Mensagem final: {len(message)} caracteres")
                print(f"   📄 Preview: {message[:100]}...")
            else:
                print("   ⚠️ Nenhuma mensagem final gerada")
        else:
            print(f"   ❌ Erro na análise: {response.status_code}")
            print(f"   📄 Resposta: {response.text[:200]}")
            
    except Exception as e:
        print(f"   ❌ Erro na requisição: {e}")
    
    # 4. Testar endpoint /analyze-personalized
    print("\n4. 🎯 Testando análise personalizada...")
    personalized_data = {
        "file_content": pdf_base64,
        "file_name": pdf_path.name,
        "user_id": "test_user_real",
        "selected_fields": {
            "monthlyReturn": True,
            "yearlyReturn": True,
            "classPerformance": {
                "Pós Fixado": True,
                "Inflação": True,
                "Fundos": False
            }
        }
    }
    
    start_time = time.time()
    try:
        response = requests.post(
            f"{base_url}/api/report/analyze-personalized",
            json=personalized_data,
            timeout=120
        )
        personalized_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ Análise personalizada bem-sucedida ({personalized_time:.2f}s)")
            print(f"   📊 Success: {result.get('success')}")
            
            if result.get('final_message'):
                message = result['final_message']
                print(f"   📝 Mensagem personalizada: {len(message)} caracteres")
                print(f"   📄 Preview: {message[:100]}...")
            else:
                print("   ⚠️ Nenhuma mensagem personalizada gerada")
        else:
            print(f"   ❌ Erro na análise personalizada: {response.status_code}")
            print(f"   📄 Resposta: {response.text[:200]}")
            
    except Exception as e:
        print(f"   ❌ Erro na requisição: {e}")
    
    # 5. Resumo final
    print("\n" + "=" * 50)
    print("🏁 RESUMO DO TESTE")
    print("=" * 50)
    print(f"📄 PDF: {pdf_path.name}")
    print(f"⏱️ Tempo de extração: {extract_time:.2f}s")
    print(f"⏱️ Tempo de análise: {analyze_time:.2f}s")
    print(f"⏱️ Tempo personalizado: {personalized_time:.2f}s")
    print(f"⏱️ Tempo total: {extract_time + analyze_time + personalized_time:.2f}s")
    print("\n✅ Teste completo realizado com sucesso!")

if __name__ == "__main__":
    test_with_attached_pdf()