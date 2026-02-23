"""
Serviço centralizado para registro de métricas de uso no Firestore.
"""
from datetime import datetime, timezone
from typing import Optional
from firebase_admin import firestore
from app.config import get_firestore_client
from app.services.digital_whitelist import is_digital
import logging

logger = logging.getLogger(__name__)

ALLOWED_METRIC_TYPES = ("automatica", "personalized")


def _get_date_string(date: Optional[str] = None) -> str:
    """
    Retorna string de data no formato ISO (YYYY-MM-DD) em UTC.
    
    Args:
        date: String de data no formato YYYY-MM-DD (opcional)
    
    Returns:
        String de data no formato YYYY-MM-DD
    """
    if date:
        return date
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def record_metric_call(user_id: str, metric_type: str, date: Optional[str] = None) -> None:
    """
    Registra uma chamada de métrica (automatica ou personalized).
    
    Incrementa o contador correspondente no documento do usuário para o dia.
    Usa transação Firestore para garantir atomicidade.
    _update_daily_total assume metric_type já validado por esta função.
    
    Args:
        user_id: ID do usuário
        metric_type: Tipo de métrica ('automatica' ou 'personalized')
        date: Data no formato YYYY-MM-DD (opcional, usa data atual se não fornecido)
    
    Raises:
        Exception: Se houver erro ao registrar métrica (não deve bloquear processamento principal)
    """
    if metric_type not in ALLOWED_METRIC_TYPES:
        logger.warning(
            f"metric_type inválido ignorado: {metric_type!r}. Esperado: {ALLOWED_METRIC_TYPES}"
        )
        return
    try:
        date_str = _get_date_string(date)
        db = get_firestore_client()
        
        # Caminho do documento: metrics/days/{date}/users/{userId}
        # Estrutura: metrics/days/{date}/users/{userId}
        doc_ref = db.collection('metrics').document(date_str).collection('users').document(user_id)
        
        # Usar transação para garantir atomicidade
        sector_value = "digital" if is_digital(user_id) else None

        @firestore.transactional
        def update_metric(transaction):
            doc = doc_ref.get(transaction=transaction)
            
            if doc.exists:
                updates = {
                    metric_type: (doc.get(metric_type) or 0) + 1,
                    'last_updated': firestore.SERVER_TIMESTAMP,
                    'date': date_str
                }
                if sector_value:
                    updates['sector'] = sector_value
                transaction.update(doc_ref, updates)
            else:
                initial_data = {
                    'automatica': 0,
                    'personalized': 0,
                    'ultra_batch_runs': [],
                    'last_updated': firestore.SERVER_TIMESTAMP,
                    'date': date_str
                }
                initial_data[metric_type] = 1
                if sector_value:
                    initial_data['sector'] = sector_value
                transaction.set(doc_ref, initial_data)
        
        transaction = db.transaction()
        update_metric(transaction)

        _update_daily_total(date_str, metric_type)
        
        logger.info(f"✅ Métrica registrada: {metric_type} para usuário {user_id} em {date_str}")
        
    except Exception as e:
        # Não falhar o processamento principal se tracking falhar
        logger.error(f"❌ Erro ao registrar métrica {metric_type} para {user_id}: {e}", exc_info=True)

def _update_daily_total(date_str: str, metric_type: str) -> None:
    """
    Atualiza total agregado do dia para uma métrica.
    
    Args:
        date_str: Data no formato YYYY-MM-DD
        metric_type: Tipo de métrica ('automatica' ou 'personalized')
    """
    try:
        db = get_firestore_client()
        total_ref = db.collection('metrics').document(date_str).collection('total').document('total')
        
        @firestore.transactional
        def update_total(transaction):
            doc = total_ref.get(transaction=transaction)
            
            if doc.exists:
                current_value = doc.get(metric_type) or 0
                transaction.update(total_ref, {
                    metric_type: current_value + 1,
                    'last_updated': firestore.SERVER_TIMESTAMP,
                    'date': date_str
                })
            else:
                initial_data = {
                    'automatica': 0,
                    'personalized': 0,
                    'ultra_batch_total_files': 0,
                    'last_updated': firestore.SERVER_TIMESTAMP,
                    'date': date_str
                }
                initial_data[metric_type] = 1
                transaction.set(total_ref, initial_data)
        
        transaction = db.transaction()
        update_total(transaction)
        
    except Exception as e:
        logger.error(f"❌ Erro ao atualizar total diário {metric_type} para {date_str}: {e}", exc_info=True)


def record_ultra_batch_start(user_id: str, job_id: str, file_count: int, date: Optional[str] = None) -> None:
    """
    Registra início de processamento ultra-batch.
    
    Adiciona entrada no array ultra_batch_runs do documento do usuário.
    
    Args:
        user_id: ID do usuário
        job_id: ID do job de ultra-batch
        file_count: Número de arquivos no batch
        date: Data no formato YYYY-MM-DD (opcional, usa data atual se não fornecido)
    
    Raises:
        Exception: Se houver erro ao registrar métrica (não deve bloquear processamento principal)
    """
    try:
        date_str = _get_date_string(date)
        db = get_firestore_client()
        
        # Caminho do documento: metrics/days/{date}/users/{userId}
        # Estrutura: metrics/days/{date}/users/{userId}
        doc_ref = db.collection('metrics').document(date_str).collection('users').document(user_id)
        
        sector_value = "digital" if is_digital(user_id) else None

        @firestore.transactional
        def update_ultra_batch(transaction):
            doc = doc_ref.get(transaction=transaction)
            
            new_entry = {
                'jobId': job_id,
                'file_count': file_count
            }
            
            if doc.exists:
                current_runs = doc.get('ultra_batch_runs') or []
                if not any(run.get('jobId') == job_id for run in current_runs):
                    current_runs.append(new_entry)
                    updates = {
                        'ultra_batch_runs': current_runs,
                        'last_updated': firestore.SERVER_TIMESTAMP,
                        'date': date_str
                    }
                    if sector_value:
                        updates['sector'] = sector_value
                    transaction.update(doc_ref, updates)
            else:
                initial_data = {
                    'automatica': 0,
                    'personalized': 0,
                    'ultra_batch_runs': [new_entry],
                    'last_updated': firestore.SERVER_TIMESTAMP,
                    'date': date_str
                }
                if sector_value:
                    initial_data['sector'] = sector_value
                transaction.set(doc_ref, initial_data)
        
        transaction = db.transaction()
        update_ultra_batch(transaction)
        
        # Atualizar total de arquivos em ultra-batch do dia
        try:
            total_ref = db.collection('metrics').document(date_str).collection('total').document('total')
            
            @firestore.transactional
            def update_total_files(transaction):
                doc = total_ref.get(transaction=transaction)
                if doc.exists:
                    current_total = doc.get('ultra_batch_total_files') or 0
                    transaction.update(total_ref, {
                        'ultra_batch_total_files': current_total + file_count,
                        'last_updated': firestore.SERVER_TIMESTAMP,
                        'date': date_str
                    })
                else:
                    transaction.set(total_ref, {
                        'automatica': 0,
                        'personalized': 0,
                        'ultra_batch_total_files': file_count,
                        'last_updated': firestore.SERVER_TIMESTAMP,
                        'date': date_str
                    })
            
            transaction_total = db.transaction()
            update_total_files(transaction_total)
        except Exception as e:
            logger.error(f"Erro ao atualizar total de arquivos ultra-batch do dia: {e}")
        
        logger.info(f"✅ Ultra-batch registrado: job {job_id} com {file_count} arquivos para usuário {user_id} em {date_str}")
        
    except Exception as e:
        # Não falhar o processamento principal se tracking falhar
        logger.error(f"❌ Erro ao registrar ultra-batch {job_id} para {user_id}: {e}", exc_info=True)


def record_ultra_batch_complete(user_id: str, job_id: str, date: Optional[str] = None) -> None:
    """
    Marca job de ultra-batch como completo e persiste status no Firestore.
    
    Atualiza o array ultra_batch_runs no documento do usuário: localiza a entrada
    com jobId == job_id e adiciona status "completed" e completedAt.
    
    Args:
        user_id: ID do usuário
        job_id: ID do job de ultra-batch
        date: Data no formato YYYY-MM-DD (opcional, usa data atual se não fornecido)
    
    Raises:
        Exception: Se houver erro ao registrar métrica (não deve bloquear processamento principal)
    """
    try:
        date_str = _get_date_string(date)
        db = get_firestore_client()
        doc_ref = db.collection("metrics").document(date_str).collection("users").document(user_id)

        sector_value = "digital" if is_digital(user_id) else None

        @firestore.transactional
        def update_complete(transaction):
            doc = doc_ref.get(transaction=transaction)
            if not doc.exists:
                logger.warning(f"Documento de métricas não encontrado para user {user_id} em {date_str}")
                return
            runs = list(doc.get("ultra_batch_runs") or [])
            for i, run in enumerate(runs):
                if run.get("jobId") == job_id:
                    runs[i] = {
                        **run,
                        "status": "completed",
                        "completedAt": datetime.now(timezone.utc).isoformat(),
                    }
                    updates = {
                        "ultra_batch_runs": runs,
                        "last_updated": firestore.SERVER_TIMESTAMP,
                        "date": date_str,
                    }
                    if sector_value:
                        updates["sector"] = sector_value
                    transaction.update(doc_ref, updates)
                    return
            logger.warning(f"Job {job_id} não encontrado em ultra_batch_runs para user {user_id}")

        transaction = db.transaction()
        update_complete(transaction)
        logger.info(f"✅ Ultra-batch completo: job {job_id} para usuário {user_id} em {date_str}")

    except Exception as e:
        logger.error(f"❌ Erro ao registrar conclusão de ultra-batch {job_id} para {user_id}: {e}", exc_info=True)

