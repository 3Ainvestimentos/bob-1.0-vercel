"""
Teste simplificado dos modelos Pydantic (sem FastAPI).
"""
import sys
from pathlib import Path

# Adicionar o diretório raiz do ai-service ao path
ai_service_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.append(str(ai_service_root))

def test_models_validation():
    """Testa validação dos modelos Pydantic."""
    print("🧪 Testando validação de modelos...")
    
    try:
        # Importar modelos
        from app.models.requests import (
            ReportAnalyzeAutoRequest,
            ReportAnalyzePersonalizedRequest,
            BatchReportRequest,
            ReportAnalyzeResponse,
            BatchReportResponse
        )
        print("✅ Importação dos modelos: OK")
        
        # Teste 1: ReportAnalyzeAutoRequest válido
        auto_request = ReportAnalyzeAutoRequest(
            file_content="JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDYgMCBSCj4+Cj4+Ci9Db250ZW50cyA3IDAgUgo+PgplbmRvYmoK",
            file_name="XPerformance_123456_Ref.29.08.pdf",
            user_id="test_user_123"
        )
        print("✅ ReportAnalyzeAutoRequest: Válido")
        print(f"   - File name: {auto_request.file_name}")
        print(f"   - User ID: {auto_request.user_id}")
        print(f"   - Content length: {len(auto_request.file_content)}")
        
        # Teste 2: ReportAnalyzePersonalizedRequest válido
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
        
        # Teste 3: BatchReportRequest válido
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
        
        # Teste 6: Serialização
        request_dict = auto_request.dict()
        print("✅ Serialização Request: OK")
        
        auto_request_2 = ReportAnalyzeAutoRequest(**request_dict)
        print("✅ Deserialização Request: OK")
        
        # Teste 7: Response
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
        
        response_dict = response.dict()
        print("✅ Serialização Response: OK")
        
        response_json = response.json()
        print("✅ JSON Response: OK")
        
        return True
        
    except Exception as e:
        print(f"❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Executa todos os testes."""
    print("🚀 TESTE DE MODELOS PYDANTIC")
    print("=" * 40)
    
    success = test_models_validation()
    
    print("\n" + "=" * 40)
    if success:
        print("🏁 TODOS OS TESTES PASSARAM!")
        print("\n📋 Próximos passos:")
        print("1. ✅ Modelos Pydantic estão funcionando")
        print("2. 🔄 Testar endpoints com servidor FastAPI rodando")
        print("3. 🔄 Implementar streaming de progresso")
    else:
        print("❌ ALGUNS TESTES FALHARAM!")
        print("\n🔧 Verificar:")
        print("1. Se os modelos estão definidos corretamente")
        print("2. Se as validações estão funcionando")
        print("3. Se há erros de importação")


if __name__ == "__main__":
    main()