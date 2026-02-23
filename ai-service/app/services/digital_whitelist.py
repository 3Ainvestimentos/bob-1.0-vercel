"""
Serviço de identificação do setor digital.

Fonte de verdade: documento Firestore config/digital_team (campo emails: string[]).
Resolve uid → email via users/{uid}.email e verifica pertencimento à lista.
"""
import logging
import time
from typing import Optional

from app.config import get_firestore_client

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 300
_digital_emails_cache: Optional[tuple[float, set[str]]] = None
_email_resolution_cache: dict[str, tuple[float, Optional[str]]] = {}


def _get_digital_emails() -> set[str]:
    """
    Retorna o conjunto de e-mails do setor digital com cache em memória.
    Lê config/digital_team.emails no Firestore.
    """
    global _digital_emails_cache

    now = time.monotonic()
    if _digital_emails_cache is not None:
        cached_at, cached_set = _digital_emails_cache
        if now - cached_at < _CACHE_TTL_SECONDS:
            return cached_set

    try:
        db = get_firestore_client()
        doc = db.collection("config").document("digital_team").get()
        if not doc.exists:
            logger.warning("Documento config/digital_team não encontrado no Firestore")
            emails: set[str] = set()
        else:
            raw = doc.to_dict().get("emails") or []
            emails = {e.strip().lower() for e in raw if isinstance(e, str) and e.strip()}
    except Exception as e:
        logger.error("Erro ao ler config/digital_team: %s", e, exc_info=True)
        if _digital_emails_cache is not None:
            return _digital_emails_cache[1]
        return set()

    _digital_emails_cache = (now, emails)
    return emails


def _resolve_email(user_id: str) -> Optional[str]:
    """
    Resolve uid → email via documento users/{uid}.
    Resultado é cacheado com TTL.
    """
    now = time.monotonic()
    cached = _email_resolution_cache.get(user_id)
    if cached is not None:
        cached_at, cached_email = cached
        if now - cached_at < _CACHE_TTL_SECONDS:
            return cached_email

    try:
        db = get_firestore_client()
        doc = db.collection("users").document(user_id).get()
        if not doc.exists:
            logger.warning("Usuário %s não encontrado em users/", user_id)
            email = None
        else:
            email = doc.to_dict().get("email")
            if email and isinstance(email, str):
                email = email.strip().lower()
            else:
                email = None
    except Exception as e:
        logger.error("Erro ao resolver email do usuário %s: %s", user_id, e, exc_info=True)
        if cached is not None:
            return cached[1]
        return None

    _email_resolution_cache[user_id] = (now, email)
    return email


def is_digital(user_id: str) -> bool:
    """
    Retorna True se o usuário (uid) pertence ao setor digital.

    Fluxo: users/{user_id}.email → normaliza → verifica em config/digital_team.emails.
    Usado para: (1) exibir botão Sheets no ultra lote; (2) gravar sector nas métricas.
    """
    email = _resolve_email(user_id)
    if not email:
        return False
    return email in _get_digital_emails()


def clear_cache() -> None:
    """Limpa caches em memória (útil para testes)."""
    global _digital_emails_cache
    _digital_emails_cache = None
    _email_resolution_cache.clear()
