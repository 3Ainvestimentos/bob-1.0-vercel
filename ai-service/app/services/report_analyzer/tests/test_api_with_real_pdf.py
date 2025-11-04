"""
Teste dos endpoints com PDF real.
"""
import base64
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app

# Criar cliente de teste
client = TestClient(app)

def test_with_real_pdf():
    """Testa endpoints com PDF real."""
    print("🧪 Testando endpoints com PDF real...")
    
    # Carregar PDF de teste
    pdf_path = Path("app/services/report_analyzer/tests/XPerformance - 5629450 - Ref.29.08 (1).pdf")
    
    if not pdf_path.exists():
        print(f"❌ PDF não encontrado: {pdf_path}")
        return
    
    # Converter para base64
    with open(pdf_path, "rb") as f:
        pdf_content = f.read()
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
    
    print(f"✅ PDF carregado: {len(pdf_content)} bytes")
    
    # Teste 1: Endpoint extract
    print("\n📄 Testando /api/report/extract...")
    try:
        response = client.post("/api/report/extract", json={
            "file_content": pdf_base64,
            "file_name": pdf_path.name,
            "user_id": "test_user_real"
        })
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Extract: Sucesso")
            print(f"   - Success: {result.get('success')}")
            print(f"   - Extracted data: {bool(result.get('extracted_data'))}")
            print(f"   - Metadata: {bool(result.get('metadata'))}")
        else:
            print(f"❌ Extract: Erro {response.status_code}")
            print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Extract: Exceção - {e}")
    
    # Teste 2: Endpoint analyze-auto (pode demorar)
    print("\n📊 Testando /api/report/analyze-auto...")
    try:
        response = client.post("/api/report/analyze-auto", json={
            "file_content": pdf_base64,
            "file_name": pdf_path.name,
            "user_id": "test_user_real"
        }, timeout=60)  # 60 segundos de timeout
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Analyze Auto: Sucesso")
            print(f"   - Success: {result.get('success')}")
            print(f"   - Final message: {bool(result.get('final_message'))}")
            print(f"   - Highlights: {len(result.get('highlights', []))}")
            print(f"   - Detractors: {len(result.get('detractors', []))}")
        else:
            print(f"❌ Analyze Auto: Erro {response.status_code}")
            print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Analyze Auto: Exceção - {e}")
    
    # Teste 3: Endpoint analyze-personalized
    print("\n🎯 Testando /api/report/analyze-personalized...")
    try:
        response = client.post("/api/report/analyze-personalized", json={
            "file_content": pdf_base64,
            "file_name": pdf_path.name,
            "user_id": "test_user_real",
            "selected_fields": {
                "monthlyReturn": True,
                "yearlyReturn": True,
                "classPerformance": {
                    "Pós Fixado": True,
                    "Inflação": False
                }
            }
        }, timeout=60)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Analyze Personalized: Sucesso")
            print(f"   - Success: {result.get('success')}")
            print(f"   - Final message: {bool(result.get('final_message'))}")
        else:
            print(f"❌ Analyze Personalized: Erro {response.status_code}")
            print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Analyze Personalized: Exceção - {e}")


def main():
    """Executa teste com PDF real."""
    print("🚀 TESTE COM PDF REAL")
    print("=" * 40)
    
    test_with_real_pdf()
    
    print("\n" + "=" * 40)
    print("🏁 TESTE CONCLUÍDO!")


if __name__ == "__main__":
    main()