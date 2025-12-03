from typing import Tuple  # ← ADICIONAR (Python 3.9) ou usar annotations
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.monitoring.logger import get_logger


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handler global para todas as exceções não tratadas
    
    Captura exceções, classifica severidade, loga no Cloud Logging
    e retorna resposta apropriada ao cliente.
    """
    
    logger = get_logger()
    
    # Extrair contexto da requisição
    context = {
        "endpoint": str(request.url),
        "method": request.method,
        "client_host": request.client.host if request.client else "unknown",
        "user_agent": request.headers.get("user-agent", "unknown"),
        "query_params": dict(request.query_params),  # ✅ ADICIONAR (opcional)
    }
    
    # ✅ ADICIONAR BODY (sanitizado)
    if request.method in ["POST", "PUT", "PATCH"]:
        try:
            body = await request.body()
            if body:
                body_str = body.decode('utf-8')[:1000]  # Max 1KB
                context["request_body"] = body_str
        except Exception:
            context["request_body"] = "<unable to read>"
    
    # Tentar extrair user_id (se disponível)
    if hasattr(request.state, "user"):
        context["user_id"] = getattr(request.state.user, "uid", "unknown")
    
    # Classificar exceção e determinar resposta
    status_code, severity, error_message = _classify_exception(exc)
    
    # ✅ LOGAR APENAS SE ATIVO
    if logger.enabled:
        logger.log_exception(
            exception=exc,
            severity=severity,
            context=context
        )
    
    # Retornar resposta ao cliente
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": error_message,
            "type": type(exc).__name__
        }
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handler específico para HTTPException (FastAPI)"""
    
    logger = get_logger()
    
    # HTTPException já tem status_code
    status_code = exc.status_code
    severity = _get_severity_from_status(status_code)
    
    # ✅ LOGAR APENAS SE ATIVO E SE FOR 5xx
    if logger.enabled and status_code >= 500:
        context = {
            "endpoint": str(request.url),
            "method": request.method,
            "status_code": status_code,
        }
        
        logger.log_exception(
            exception=exc,
            severity=severity,
            context=context
        )
    
    return JSONResponse(
        status_code=status_code,
        content={"detail": exc.detail}
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handler para erros de validação (Pydantic)"""
    
    logger = get_logger()
    
    # Validação é WARNING (não é erro crítico)
    context = {
        "endpoint": str(request.url),
        "method": request.method,
        "validation_errors": exc.errors(),
    }
    
    # ✅ LOGAR APENAS SE ATIVO
    if logger.enabled:
        logger.log_struct(
            message="Validation error",
            severity="WARNING",
            extra=context
        )
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()}
    )


def _classify_exception(exc: Exception) -> Tuple[int, str, str]:  # ← CORRIGIR
    """
    Classifica exceção e retorna (status_code, severity, message)
    
    Returns:
        Tuple: (status_code: int, severity: str, message: str)
    """
    
    # HTTPException (FastAPI)
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        status_code = exc.status_code
        severity = _get_severity_from_status(status_code)
        message = exc.detail if hasattr(exc, 'detail') else str(exc)
        return status_code, severity, message
    
    # RequestValidationError (Pydantic)
    if isinstance(exc, RequestValidationError):
        return 422, "WARNING", "Validation error"
    
    # TimeoutError
    if isinstance(exc, TimeoutError):
        return 504, "CRITICAL", "Request timeout"
    
    # Exceções de dependências externas
    if "gemini" in str(exc).lower() or "google.generativeai" in str(type(exc)):
        return 503, "CRITICAL", "External service unavailable (Gemini API)"
    
    if "firebase" in str(exc).lower() or "firestore" in str(exc).lower():
        return 503, "CRITICAL", "External service unavailable (Firebase)"
    
    # Exceção genérica (não tratada)
    return 500, "CRITICAL", "Internal server error"


def _get_severity_from_status(status_code: int) -> str:
    """Determina severidade baseado no status code"""
    
    if status_code >= 500:
        return "CRITICAL"  # Erro de servidor
    elif status_code >= 400:
        return "ERROR"  # Erro de cliente
    elif status_code >= 300:
        return "WARNING"  # Redirecionamento
    else:
        return "INFO"  # Sucesso
