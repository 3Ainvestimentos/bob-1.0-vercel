"""
Logger estruturado para Cloud Logging
"""

from google.cloud import logging as cloud_logging
import traceback
from typing import Dict, Any, Optional
from datetime import datetime
import time 

from app.config import (
    MONITORING_ACTIVE,
    GCP_PROJECT_ID,
    GCP_LOG_NAME,
    MONITORING_ENVIRONMENT,
    MONITORING_MIN_SEVERITY
)


class StructuredLogger:
    """Logger que envia logs estruturados para Cloud Logging"""
    
    def __init__(self):
        self.enabled = MONITORING_ACTIVE
        
        if self.enabled:
            try:
                # Cliente Cloud Logging
                self.client = cloud_logging.Client(project=GCP_PROJECT_ID)
                self.logger = self.client.logger(GCP_LOG_NAME)
                print(f"[LOGGER] ✅ Cloud Logging configurado: {GCP_PROJECT_ID}/{GCP_LOG_NAME}")
            except Exception as e:
                print(f"[LOGGER] ❌ Erro ao configurar Cloud Logging: {e}")
                self.enabled = False
        else:
            print(f"[LOGGER] ⚠️  Monitoramento desativado (ambiente: {MONITORING_ENVIRONMENT})")
            self.logger = None
    
    def _should_log(self, severity: str) -> bool:
        """Verifica se deve logar baseado no nível mínimo"""
        levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        
        try:
            min_index = levels.index(MONITORING_MIN_SEVERITY)
            current_index = levels.index(severity)
            return current_index >= min_index
        except ValueError:
            return True  # Se inválido, loga
    
    def log_exception(
        self,
        exception: Exception,
        severity: str = "ERROR",
        context: Optional[Dict[str, Any]] = None
    ):
        """
        Loga exceção estruturada no Cloud Logging
        
        Args:
            exception: Exceção capturada
            severity: DEBUG, INFO, WARNING, ERROR, CRITICAL
            context: Contexto adicional (endpoint, user_id, etc)
        """
        if not self.enabled or not self._should_log(severity):
            return

            # ✅ ADICIONAR VALIDAÇÃO
        if self.logger is None:
            print(f"[LOGGER] ⚠️  Logger não inicializado, pulando log")
            return
    

                # ✅ LIMITAR TRACEBACK
        full_traceback = traceback.format_exc()
        max_traceback_length = 5000  # 5 KB
        
        if len(full_traceback) > max_traceback_length:
            truncated = full_traceback[:max_traceback_length]
            traceback_value = truncated + "\n\n... [TRUNCADO]"
        else:
            traceback_value = full_traceback
        
        # Estruturar log
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "severity": severity,
            "exception_type": type(exception).__name__,
            "exception_message": str(exception),
            "traceback": traceback_value,
            "context": context or {}
        }
        
        # Sanitizar dados sensíveis
        log_entry = self._sanitize(log_entry)

        max_retries = 3

        for attempt in range(max_retries):
            try:
                # Enviar para Cloud Logging
                self.logger.log_struct(log_entry, severity=severity)
                print(f"[LOGGER] 📤 Log enviado: {severity} - {type(exception).__name__}")
                return
            except Exception as e:
                print(f"[LOGGER] ❌ Erro ao enviar log: {e}")
            else:
                # Retry com backoff exponencial
                wait_time = 0.1 * (2 ** attempt)  # 0.1s, 0.2s, 0.4s
                time.sleep(wait_time)
    
    def log_struct(
        self,
        message: str,
        severity: str = "INFO",
        extra: Optional[Dict[str, Any]] = None
    ):
        """
        Loga mensagem estruturada
        
        Args:
            message: Mensagem principal
            severity: Nível de severidade
            extra: Dados adicionais
        """
        if not self.enabled or not self._should_log(severity):
            return
        
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "severity": severity,
            "message": message,
            **(extra or {})
        }
        
        log_entry = self._sanitize(log_entry)
        
        try:
            self.logger.log_struct(log_entry, severity=severity)
        except Exception as e:
            print(f"[LOGGER] ❌ Erro ao enviar log: {e}")
    
    def _sanitize(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Remove dados sensíveis antes de logar"""
        sensitive_keys = [
            "password", "token", "secret", "api_key", "apikey",
            "authorization", "cookie", "session", "credit_card",
            "ssn", "cpf", "cnpj"
        ]
        
        def sanitize_dict(d: dict) -> dict:
            result = {}
            for key, value in d.items():
                # Chave sensível
                if any(s in key.lower() for s in sensitive_keys):
                    result[key] = "***REDACTED***"
                # Valor é dict, recursivo
                elif isinstance(value, dict):
                    result[key] = sanitize_dict(value)
                # Valor é lista
                elif isinstance(value, list):
                    result[key] = [
                        sanitize_dict(item) if isinstance(item, dict) else item
                        for item in value
                    ]
                else:
                    result[key] = value
            return result
        
        return sanitize_dict(data)


# Singleton
_logger_instance = None


def get_logger() -> StructuredLogger:
    """Retorna instância singleton do logger"""
    global _logger_instance
    if _logger_instance is None:
        _logger_instance = StructuredLogger()
    return _logger_instance

