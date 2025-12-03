"""
Endpoints temporários para teste de error handler

⚠️ ESTE ARQUIVO É TEMPORÁRIO - REMOVER APÓS TESTES
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
import asyncio

router = APIRouter(prefix="/test", tags=["test"])


class TestRequest(BaseModel):
    """Modelo para testar validação"""
    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    age: int = Field(..., ge=0, le=150)
    password: str = Field(..., min_length=8)


@router.get("/health")
async def test_health():
    """Endpoint simples que funciona (não gera erro)"""
    return {
        "status": "ok",
        "message": "Test endpoint funcionando corretamente"
    }


@router.get("/error-500")
async def test_error_500():
    """
    Simula erro 500 genérico
    
    Esperado:
    - Status: 500
    - Severity: CRITICAL
    - Log no Cloud Logging com traceback completo
    """
    raise Exception("Erro 500 simulado para teste de monitoramento")


@router.get("/error-404")
async def test_error_404():
    """
    Simula erro 404
    
    Esperado:
    - Status: 404
    - Severity: ERROR
    - Não loga (4xx não são logados por padrão)
    """
    raise HTTPException(status_code=404, detail="Recurso não encontrado (teste)")


@router.get("/error-503")
async def test_error_503():
    """
    Simula erro 503 (serviço indisponível)
    
    Esperado:
    - Status: 503
    - Severity: CRITICAL
    - Log no Cloud Logging
    """
    raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível (teste)")


@router.get("/error-timeout")
async def test_error_timeout(seconds: int = Query(default=100, ge=1, le=600)):
    """
    Simula timeout (aguarda X segundos)
    
    Params:
        seconds: Tempo de espera em segundos (padrão: 100)
    
    Esperado:
    - Timeout do Cloud Run após 60s (configurado)
    - Status: 504
    - Severity: CRITICAL
    """
    await asyncio.sleep(seconds)
    return {"status": "ok", "waited": seconds}


@router.get("/error-timeout-explicit")
async def test_error_timeout_explicit():
    """
    Lança TimeoutError explicitamente
    
    Esperado:
    - Status: 504
    - Severity: CRITICAL
    - Message: "Request timeout"
    """
    raise TimeoutError("Timeout de processamento (teste)")


@router.get("/error-gemini-api")
async def test_error_gemini_api():
    """
    Simula erro da Gemini API
    
    Esperado:
    - Status: 503
    - Severity: CRITICAL
    - Message: "External service unavailable (Gemini API)"
    """
    raise Exception("google.generativeai error: rate limit exceeded")


@router.get("/error-firebase")
async def test_error_firebase():
    """
    Simula erro do Firebase
    
    Esperado:
    - Status: 503
    - Severity: CRITICAL
    - Message: "External service unavailable (Firebase)"
    """
    raise Exception("firebase_admin.exceptions.FirebaseError: connection timeout")


@router.post("/error-validation")
async def test_error_validation(data: TestRequest):
    """
    Testa erro de validação (Pydantic)
    
    Envie dados inválidos para testar:
    - Email inválido
    - Age fora do range (0-150)
    - Password com menos de 8 caracteres
    
    Esperado:
    - Status: 422
    - Severity: WARNING
    - Log com validation_errors
    """
    return {
        "status": "ok",
        "message": "Validação passou",
        "data": data.dict()
    }


@router.get("/error-division-zero")
async def test_error_division_zero():
    """
    Simula ZeroDivisionError
    
    Esperado:
    - Status: 500
    - Severity: CRITICAL
    - Traceback com linha do erro
    """
    x = 10
    y = 0
    result = x / y  # Vai gerar ZeroDivisionError
    return {"result": result}


@router.get("/error-with-sensitive-data")
async def test_error_with_sensitive_data():
    """
    Testa sanitização de dados sensíveis
    
    Esperado:
    - Dados sensíveis (password, api_key) devem ser mascarados como ***REDACTED***
    """
    # Simular contexto com dados sensíveis
    user_data = {
        "username": "test_user",
        "password": "senha_secreta_123",  # Deve ser sanitizado
        "api_key": "sk-1234567890abcdef",  # Deve ser sanitizado
        "email": "test@example.com"  # Não deve ser sanitizado
    }
    
    # Forçar erro para testar sanitização
    raise Exception(f"Erro ao processar usuário: {user_data}")


@router.get("/generate-load")
async def test_generate_load(
    count: int = Query(default=10, ge=1, le=1000),
    error_rate: float = Query(default=0.5, ge=0.0, le=1.0)
):
    """
    Gera carga de requisições (para testar alertas)
    
    Params:
        count: Número de "operações" a simular (padrão: 10)
        error_rate: Taxa de erro (0.0-1.0, padrão: 0.5 = 50%)
    
    Use este endpoint para simular carga e disparar alertas de taxa de erro.
    """
    import random
    
    results = {
        "total": count,
        "success": 0,
        "errors": 0
    }
    
    for i in range(count):
        if random.random() < error_rate:
            results["errors"] += 1
            # Simular erro
            try:
                raise Exception(f"Erro simulado {i+1}/{count}")
            except Exception:
                pass  # Ignorar para continuar loop
        else:
            results["success"] += 1
    
    return results


@router.get("/info")
async def test_info():
    """Retorna informações sobre os endpoints de teste"""
    return {
        "message": "Endpoints de teste de error handler",
        "warning": "⚠️ ESTES ENDPOINTS SÃO TEMPORÁRIOS - REMOVER APÓS TESTES",
        "endpoints": [
            {"path": "/test/health", "description": "Endpoint saudável (não gera erro)"},
            {"path": "/test/error-500", "description": "Erro 500 genérico"},
            {"path": "/test/error-404", "description": "Erro 404"},
            {"path": "/test/error-503", "description": "Erro 503"},
            {"path": "/test/error-timeout", "description": "Timeout (aguarda X segundos)"},
            {"path": "/test/error-timeout-explicit", "description": "TimeoutError explícito"},
            {"path": "/test/error-gemini-api", "description": "Simula erro Gemini API"},
            {"path": "/test/error-firebase", "description": "Simula erro Firebase"},
            {"path": "/test/error-validation", "description": "Erro de validação (POST)"},
            {"path": "/test/error-division-zero", "description": "ZeroDivisionError"},
            {"path": "/test/error-with-sensitive-data", "description": "Testa sanitização"},
            {"path": "/test/generate-load", "description": "Gera carga para testar alertas"},
        ],
        "usage": {
            "local": "http://localhost:8080/test/error-500",
            "prod": "https://bob-ai-service-prod-XXX.run.app/test/error-500"
        }
    }

