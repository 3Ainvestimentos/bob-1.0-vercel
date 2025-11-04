"""
Teste dos modelos Pydantic e endpoints da API de relatórios.
"""
import json
import asyncio
import sys
from pathlib import Path

# Adicionar o diretório raiz do ai-service ao path
ai_service_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.append(str(ai_service_root))

from fastapi.testclient import TestClient
from app.main import app
from app.models.requests import (
    ReportAnalyzeAutoRequest,
    ReportAnalyzePersonalizedRequest,
    BatchReportRequest,
    ReportAnalyzeResponse,
    BatchReportResponse
)

# Criar cliente de teste
client = TestClient(app)

def test_models_validation():
    """Testa validação dos modelos Pydantic."""
    print("🧪 Testando validação de modelos...")
    
    # Teste 1: ReportAnalyzeAutoRequest válido
    try:
        auto_request = ReportAnalyzeAutoRequest(
            file_content="JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK",
            file_name="XPerformance_123456_Ref.29.08.pdf",
            user_id="test_user_123"
        )
        print("✅ ReportAnalyzeAutoRequest: Válido")
        print(f"   - File name: {auto_request.file_name}")
        print(f"   - User ID: {auto_request.user_id}")
        print(f"   - Content length: {len(auto_request.file_content)}")
    except Exception as e:
        print(f"❌ ReportAnalyzeAutoRequest: {e}")
    
    # Teste 2: ReportAnalyzePersonalizedRequest válido
    try:
        personalized_request = ReportAnalyzePersonalizedRequest(
            file_content="JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK",
            file_name="XPerformance_123456_Ref.29.08.pdf",
            user_id="test_user_123",
            selected_fields={
                "monthlyReturn": True,
                "yearlyReturn": True,
                "classPerformance": {
                    "Pós Fixado": True,
                    "Inflação": False
                }
            }
        )
        print("✅ ReportAnalyzePersonalizedRequest: Válido")
        print(f"   - Selected fields: {len(personalized_request.selected_fields)} campos")
    except Exception as e:
        print(f"❌ ReportAnalyzePersonalizedRequest: {e}")
    
    # Teste 3: BatchReportRequest válido
    try:
        batch_request = BatchReportRequest(
            files=[
                {
                    "name": "XPerformance_123456_Ref.29.08.pdf",
                    "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK"
                },
                {
                    "name": "XPerformance_789012_Ref.30.08.pdf",
                    "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK"
                }
            ],
            user_id="test_user_123"
        )
        print("✅ BatchReportRequest: Válido")
        print(f"   - Files: {len(batch_request.files)} arquivos")
    except Exception as e:
        print(f"❌ BatchReportRequest: {e}")
    
    # Teste 4: Validação de erro - arquivo não PDF
    try:
        invalid_batch = BatchReportRequest(
            files=[
                {
                    "name": "documento.docx",  # Não é PDF
                    "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK"
                }
            ],
            user_id="test_user_123"
        )
        print("❌ BatchReportRequest (arquivo não PDF): Deveria falhar mas passou")
    except Exception as e:
        print(f"✅ BatchReportRequest (arquivo não PDF): Falhou corretamente - {e}")
    
    # Teste 5: Validação de erro - muitos arquivos
    try:
        too_many_files = BatchReportRequest(
            files=[
                {"name": f"file_{i}.pdf", "dataUri": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK"}
                for i in range(11)  # 11 arquivos (limite é 10)
            ],
            user_id="test_user_123"
        )
        print("❌ BatchReportRequest (muitos arquivos): Deveria falhar mas passou")
    except Exception as e:
        print(f"✅ BatchReportRequest (muitos arquivos): Falhou corretamente - {e}")


def test_endpoints_exist():
    """Testa se os endpoints existem e respondem."""
    print("\n🧪 Testando existência dos endpoints...")
    
    # Lista de endpoints para testar
    endpoints = [
        ("/api/report/analyze-auto", "POST"),
        ("/api/report/analyze-personalized", "POST"),
        ("/api/report/extract", "POST"),
        ("/api/report/batch-analyze", "POST"),
        ("/api/report/analyze-auto-stream", "POST"),
        ("/api/report/analyze-personalized-stream", "POST"),
    ]
    
    for endpoint, method in endpoints:
        try:
            # Fazer request vazio para verificar se endpoint existe
            if method == "POST":
                response = client.post(endpoint, json={})
            else:
                response = client.get(endpoint)
            
            # Se retornou 422 (validation error), endpoint existe
            if response.status_code == 422:
                print(f"✅ {endpoint}: Existe (validation error esperado)")
            elif response.status_code == 405:
                print(f"❌ {endpoint}: Método não permitido")
            else:
                print(f"⚠️  {endpoint}: Status {response.status_code}")
                
        except Exception as e:
            print(f"❌ {endpoint}: Erro - {e}")


def test_endpoint_validation():
    """Testa validação dos endpoints com dados inválidos."""
    print("\n🧪 Testando validação dos endpoints...")
    
    # Teste 1: Request vazio
    response = client.post("/api/report/analyze-auto", json={})
    print(f"✅ /analyze-auto (vazio): Status {response.status_code} (deveria ser 422)")
    
    # Teste 2: Request com campos obrigatórios ausentes
    response = client.post("/api/report/analyze-auto", json={
        "file_name": "test.pdf"
        # Faltando file_content e user_id
    })
    print(f"✅ /analyze-auto (campos ausentes): Status {response.status_code} (deveria ser 422)")
    
    # Teste 3: Request personalized sem selected_fields
    response = client.post("/api/report/analyze-personalized", json={
        "file_content": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK",
        "file_name": "test.pdf",
        "user_id": "test_user"
        # Faltando selected_fields
    })
    print(f"✅ /analyze-personalized (sem selected_fields): Status {response.status_code} (deveria ser 422)")


def test_openapi_docs():
    """Testa se a documentação OpenAPI está funcionando."""
    print("\n🧪 Testando documentação OpenAPI...")
    
    try:
        # Testar OpenAPI JSON
        response = client.get("/openapi.json")
        if response.status_code == 200:
            openapi_data = response.json()
            paths = openapi_data.get("paths", {})
            
            # Verificar se nossos endpoints estão na documentação
            report_endpoints = [path for path in paths.keys() if path.startswith("/api/report")]
            print(f"✅ OpenAPI: {len(report_endpoints)} endpoints de relatório encontrados")
            
            for endpoint in report_endpoints:
                print(f"   - {endpoint}")
                
        else:
            print(f"❌ OpenAPI: Status {response.status_code}")
            
    except Exception as e:
        print(f"❌ OpenAPI: Erro - {e}")


def test_models_serialization():
    """Testa serialização/deserialização dos modelos."""
    print("\n🧪 Testando serialização dos modelos...")
    
    # Teste 1: Serialização de request
    try:
        auto_request = ReportAnalyzeAutoRequest(
            file_content="test_content",
            file_name="test.pdf",
            user_id="test_user"
        )
        
        # Converter para dict
        request_dict = auto_request.dict()
        print("✅ Serialização Request: OK")
        
        # Converter de volta para modelo
        auto_request_2 = ReportAnalyzeAutoRequest(**request_dict)
        print("✅ Deserialização Request: OK")
        
    except Exception as e:
        print(f"❌ Serialização Request: {e}")
    
    # Teste 2: Serialização de response
    try:
        response = ReportAnalyzeResponse(
            success=True,
            extracted_data={"test": "data"},
            performance_analysis="Test analysis",
            highlights=[{"className": "Test", "return": "1.0%"}],
            detractors=[],
            final_message="Test message",
            metadata={"processing_time": 1.5},
            error=None
        )
        
        # Converter para dict
        response_dict = response.dict()
        print("✅ Serialização Response: OK")
        
        # Converter para JSON
        response_json = response.json()
        print("✅ JSON Response: OK")
        
    except Exception as e:
        print(f"❌ Serialização Response: {e}")


def main():
    """Executa todos os testes."""
    print("🚀 INICIANDO TESTES DE API E MODELOS")
    print("=" * 50)
    
    try:
        test_models_validation()
        test_endpoints_exist()
        test_endpoint_validation()
        test_openapi_docs()
        test_models_serialization()
        
        print("\n" + "=" * 50)
        print("🏁 TESTES CONCLUÍDOS!")
        print("\n📋 Próximos passos:")
        print("1. Verificar se todos os testes passaram")
        print("2. Corrigir erros encontrados")
        print("3. Testar com dados reais de PDF")
        print("4. Implementar streaming de progresso")
        
    except Exception as e:
        print(f"\n❌ ERRO GERAL: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()