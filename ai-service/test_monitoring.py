"""
Script de teste para validar error handler e logging

Execute: python test_monitoring.py
"""

import sys
import os

# Adicionar diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.monitoring.logger import get_logger


def test_logger():
    """Testa logger estruturado"""
    logger = get_logger()
    
    print("\n" + "="*60)
    print("TESTANDO STRUCTURED LOGGER")
    print("="*60)
    
    print("\n1️⃣  Testando log INFO...")
    logger.log_struct(
        message="Teste de log INFO - Aplicação iniciada",
        severity="INFO",
        extra={"test": True, "component": "test_monitoring"}
    )
    
    print("\n2️⃣  Testando log WARNING...")
    logger.log_struct(
        message="Teste de log WARNING - Recurso próximo do limite",
        severity="WARNING",
        extra={"test": True, "resource": "memory", "usage_percent": 75}
    )
    
    print("\n3️⃣  Testando log ERROR com exceção...")
    try:
        # Simular erro de validação
        raise ValueError("Erro de validação: campo 'email' inválido")
    except Exception as e:
        logger.log_exception(
            e,
            severity="ERROR",
            context={
                "endpoint": "/test/validation",
                "method": "POST",
                "user_id": "test_user_123"
            }
        )
    
    print("\n4️⃣  Testando log CRITICAL com exceção complexa...")
    try:
        # Simular erro crítico (ex: API externa falhou)
        raise Exception("Gemini API falhou após 3 tentativas - timeout de 30s")
    except Exception as e:
        logger.log_exception(
            e,
            severity="CRITICAL",
            context={
                "endpoint": "/api/report/analyze",
                "method": "POST",
                "user_id": "test_user_456",
                "report_id": "report_789",
                "retry_count": 3
            }
        )
    
    print("\n5️⃣  Testando sanitização de dados sensíveis...")
    logger.log_struct(
        message="Teste de sanitização - dados sensíveis devem ser removidos",
        severity="INFO",
        extra={
            "user": {
                "name": "João Silva",
                "email": "joao@example.com",
                "password": "senha123",  # Deve ser sanitizado
                "api_key": "sk-1234567890",  # Deve ser sanitizado
            },
            "request": {
                "endpoint": "/auth/login",
                "authorization": "Bearer token123",  # Deve ser sanitizado
            }
        }
    )
    
    print("\n" + "="*60)
    if logger.enabled:
        print("✅ Testes concluídos!")
        print("\n📊 Verifique os logs no Cloud Logging:")
        print(f"   https://console.cloud.google.com/logs/query?project=datavisor-44i5m")
        print(f"\n🔍 Query sugerida:")
        print(f'   logName="projects/datavisor-44i5m/logs/bob-ai-service"')
        print(f'   AND severity>=INFO')
    else:
        print("⚠️  Logger desabilitado (não está em produção)")
        print("   Para ativar, defina: MONITORING_ENVIRONMENT=production")
    print("="*60 + "\n")


def test_exception_classification():
    """Testa classificação de exceções"""
    from app.middleware.error_handler import _classify_exception, _get_severity_from_status
    
    print("\n" + "="*60)
    print("TESTANDO CLASSIFICAÇÃO DE EXCEÇÕES")
    print("="*60)
    
    # Teste 1: ValueError genérico
    print("\n1️⃣  ValueError genérico:")
    try:
        raise ValueError("Valor inválido")
    except Exception as e:
        status, severity, message = _classify_exception(e)
        print(f"   Status: {status}, Severity: {severity}, Message: {message}")
    
    # Teste 2: TimeoutError
    print("\n2️⃣  TimeoutError:")
    try:
        raise TimeoutError("Operação excedeu timeout")
    except Exception as e:
        status, severity, message = _classify_exception(e)
        print(f"   Status: {status}, Severity: {severity}, Message: {message}")
    
    # Teste 3: Erro do Gemini (simulado)
    print("\n3️⃣  Erro Gemini API (simulado):")
    try:
        raise Exception("google.generativeai.types.generation_types.BlockedPromptException")
    except Exception as e:
        status, severity, message = _classify_exception(e)
        print(f"   Status: {status}, Severity: {severity}, Message: {message}")
    
    # Teste 4: Mapeamento de status codes
    print("\n4️⃣  Mapeamento de status codes:")
    test_codes = [200, 301, 400, 404, 500, 503]
    for code in test_codes:
        severity = _get_severity_from_status(code)
        print(f"   {code} → {severity}")
    
    print("\n" + "="*60)
    print("✅ Testes de classificação concluídos!")
    print("="*60 + "\n")


if __name__ == "__main__":
    print("\n🚀 Iniciando testes de monitoramento...\n")
    
    # Teste 1: Logger estruturado
    test_logger()
    
    # Teste 2: Classificação de exceções
    test_exception_classification()
    
    print("🎉 Todos os testes executados!\n")

