"""
Teste dos endpoints FastAPI com dados reais.
"""
import sys
from pathlib import Path
import requests
import json

# Adicionar o diretório raiz do ai-service ao path
ai_service_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.append(str(ai_service_root))

def test_endpoints():
    """Testa os endpoints da API."""
    base_url = "http://localhost:8000"
    
    print("🧪 Testando endpoints da API...")
    
    # Dados de teste
    test_data = {
        "file_content": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK",
        "file_name": "XPerformance_123456_Ref.29.08.pdf",
        "user_id": "test_user_123"
    }
    
    # Teste 1: Health check
    try:
        response = requests.get(f"{base_url}/")
        print(f"✅ Health check: Status {response.status_code}")
    except Exception as e:
        print(f"❌ Health check: {e}")
        return
    
    # Teste 2: OpenAPI docs
    try:
        response = requests.get(f"{base_url}/docs")
        print(f"✅ OpenAPI docs: Status {response.status_code}")
    except Exception as e:
        print(f"❌ OpenAPI docs: {e}")
    
    # Teste 3: Endpoint /extract
    try:
        response = requests.post(
            f"{base_url}/api/report/extract",
            json=test_data,
            timeout=30
        )
        print(f"✅ /extract: Status {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"   - Success: {result.get('success')}")
            print(f"   - Has extracted_data: {bool(result.get('extracted_data'))}")
        else:
            print(f"   - Error: {response.text[:200]}")
    except Exception as e:
        print(f"❌ /extract: {e}")
    
    # Teste 4: Endpoint /analyze-auto
    try:
        response = requests.post(
            f"{base_url}/api/report/analyze-auto",
            json=test_data,
            timeout=60
        )
        print(f"✅ /analyze-auto: Status {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"   - Success: {result.get('success')}")
            print(f"   - Has final_message: {bool(result.get('final_message'))}")
        else:
            print(f"   - Error: {response.text[:200]}")
    except Exception as e:
        print(f"❌ /analyze-auto: {e}")
    
    # Teste 5: Endpoint /analyze-personalized
    try:
        personalized_data = {
            **test_data,
            "selected_fields": {
                "monthlyReturn": True,
                "yearlyReturn": True,
                "classPerformance": {
                    "Pós Fixado": True,
                    "Inflação": False
                }
            }
        }
        
        response = requests.post(
            f"{base_url}/api/report/analyze-personalized",
            json=personalized_data,
            timeout=60
        )
        print(f"✅ /analyze-personalized: Status {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"   - Success: {result.get('success')}")
            print(f"   - Has final_message: {bool(result.get('final_message'))}")
        else:
            print(f"   - Error: {response.text[:200]}")
    except Exception as e:
        print(f"❌ /analyze-personalized: {e}")
    
    # Teste 6: Endpoint /batch-analyze
    try:
        batch_data = {
            "files": [
                {
                    "name": "XPerformance_123456_Ref.29.08.pdf",
                    "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK"
                },
                {
                    "name": "XPerformance_789012_Ref.30.08.pdf",
                    "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK"
                }
            ],
            "user_id": "test_user_123"
        }
        
        response = requests.post(
            f"{base_url}/api/report/batch-analyze",
            json=batch_data,
            timeout=120
        )
        print(f"✅ /batch-analyze: Status {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"   - Success: {result.get('success')}")
            print(f"   - Results count: {len(result.get('results', []))}")
        else:
            print(f"   - Error: {response.text[:200]}")
    except Exception as e:
        print(f"❌ /batch-analyze: {e}")


def main():
    """Executa todos os testes."""
    print("🚀 TESTE DE ENDPOINTS FASTAPI")
    print("=" * 40)
    print("⚠️  Certifique-se de que o servidor está rodando em http://localhost:8000")
    print("=" * 40)
    
    test_endpoints()
    
    print("\n" + "=" * 40)
    print("🏁 TESTES CONCLUÍDOS!")
    print("\n📋 Próximos passos:")
    print("1. Se todos os endpoints funcionaram, a API está pronta")
    print("2. Implementar streaming de progresso (SSE)")
    print("3. Integrar com o frontend")


if __name__ == "__main__":
    main()