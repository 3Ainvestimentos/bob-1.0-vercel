import calendar
import logging
from datetime import datetime, timezone
from typing import Any

from firebase_admin import firestore

from config import (
    COLLECTION_CONFIG,
    COLLECTION_METRICS,
    COLLECTION_METRICS_SUMMARY,
    COLLECTION_ULTRA_BATCH_JOBS,
    COLLECTION_USERS,
    DEFAULT_TOTAL_ASSESSORS,
    DOC_DIGITAL_TEAM,
    DOC_METRICS_CONFIG,
    DOC_TOTAL,
    SUBDOC_TOTAL,
    SUBDOC_USERS,
)

logger = logging.getLogger(__name__)


def _month_range(year: int, month: int) -> list[str]:
    last = calendar.monthrange(year, month)[1]
    return [f"{year}-{month:02d}-{d:02d}" for d in range(1, last + 1)]


def _get_month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    last = calendar.monthrange(year, month)[1]
    end = datetime(year, month, last, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return start, end


def _prev_month(month_key: str) -> str:
    year, month = int(month_key[:4]), int(month_key[5:7])
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def _read_total_assessors(db: firestore.Client) -> int:
    try:
        doc = (
            db.collection(COLLECTION_CONFIG)
            .document(DOC_METRICS_CONFIG)
            .get()
        )
        if doc.exists:
            value = (doc.to_dict() or {}).get("total_assessors")
            if isinstance(value, int) and value > 0:
                return value
    except Exception as e:
        logger.warning(
            "Falha ao ler total_assessors do Firestore: %s. Usando fallback=%d",
            e,
            DEFAULT_TOTAL_ASSESSORS,
        )
    return DEFAULT_TOTAL_ASSESSORS


def _load_digital_uids(db: firestore.Client) -> tuple[set[str], int]:
    try:
        config_doc = (
            db.collection(COLLECTION_CONFIG).document(DOC_DIGITAL_TEAM).get()
        )
        if not config_doc.exists:
            logger.warning(
                "config/digital_team não encontrado; métricas digitais zeradas."
            )
            return set(), 0
        emails: list[str] = [
            e.strip().lower()
            for e in ((config_doc.to_dict() or {}).get("emails") or [])
            if isinstance(e, str) and e.strip()
        ]
        digital_team_size = len(emails)
    except Exception as e:
        logger.error("Falha ao ler config/digital_team: %s", e)
        return set(), 0

    digital_uids: set[str] = set()
    users_col = db.collection(COLLECTION_USERS)
    for email in emails:
        try:
            docs = list(users_col.where("email", "==", email).limit(1).stream())
            if docs:
                digital_uids.add(docs[0].id)
            else:
                logger.warning("Email digital sem UID correspondente: %s", email)
        except Exception as e:
            logger.warning("Falha ao resolver email→UID para %s: %s", email, e)

    logger.info(
        "Time digital: %d emails, %d UIDs resolvidos",
        digital_team_size,
        len(digital_uids),
    )
    return digital_uids, digital_team_size


def _collect_active_uids(
    db: firestore.Client,
    date_list: list[str],
    filter_uids: set[str] | None = None,
) -> set[str]:
    seen: set[str] = set()
    for date_str in date_list:
        users_ref = (
            db.collection(COLLECTION_METRICS)
            .document(date_str)
            .collection(SUBDOC_USERS)
        )
        for doc in users_ref.stream():
            if filter_uids is not None and doc.id not in filter_uids:
                continue
            data = doc.to_dict() or {}
            automatica = data.get("automatica") or 0
            personalized = data.get("personalized") or 0
            ultra_batch_runs = data.get("ultra_batch_runs") or []
            if automatica > 0 or personalized > 0 or len(ultra_batch_runs) > 0:
                seen.add(doc.id)
    return seen


def _get_uids_for_month(
    db: firestore.Client,
    month_key: str,
    uid_field: str = "active_uids",
) -> set[str]:
    ref = db.collection(COLLECTION_METRICS_SUMMARY).document(month_key)
    doc = ref.get()
    if doc.exists:
        data = doc.to_dict() or {}
        adoption = data.get("adoption") or {}
        cached = adoption.get(uid_field)
        if isinstance(cached, list) and cached:
            return set(cached)

    parts = month_key.split("-")
    year, month = int(parts[0]), int(parts[1])
    date_list = _month_range(year, month)
    if uid_field == "digital_active_uids":
        digital_uids, _ = _load_digital_uids(db)
        return _collect_active_uids(db, date_list, filter_uids=digital_uids)
    return _collect_active_uids(db, date_list)


def _compute_persistence(
    uids_m: set[str],
    uids_m1: set[str],
    uids_m2: set[str],
) -> int:
    return len(uids_m & uids_m1 & uids_m2)


def _compute_volume_and_ultra_files(
    db: firestore.Client, date_list: list[str]
) -> tuple[int, int]:
    total_analyses = 0
    ultra_total = 0
    for date_str in date_list:
        total_ref = (
            db.collection(COLLECTION_METRICS)
            .document(date_str)
            .collection(SUBDOC_TOTAL)
            .document(DOC_TOTAL)
        )
        doc = total_ref.get()
        if not doc.exists:
            continue
        data = doc.to_dict() or {}
        automatica = data.get("automatica") or 0
        personalized = data.get("personalized") or 0
        ultra_batch_total_files = data.get("ultra_batch_total_files") or 0
        total_analyses += automatica + personalized + ultra_batch_total_files
        ultra_total += ultra_batch_total_files
    return total_analyses, ultra_total


def _compute_digital_volume(
    db: firestore.Client,
    date_list: list[str],
    digital_uids: set[str],
) -> int:
    total = 0
    for date_str in date_list:
        users_ref = (
            db.collection(COLLECTION_METRICS)
            .document(date_str)
            .collection(SUBDOC_USERS)
        )
        for doc in users_ref.stream():
            if doc.id not in digital_uids:
                continue
            data = doc.to_dict() or {}
            automatica = data.get("automatica") or 0
            personalized = data.get("personalized") or 0
            runs = data.get("ultra_batch_runs") or []
            file_count = sum(r.get("file_count") or 0 for r in runs)
            total += automatica + personalized + file_count
    return total


def _compute_quality_and_scale(
    db: firestore.Client, start_ts: datetime, end_ts: datetime
) -> tuple[float, float, int]:
    jobs_ref = db.collection(COLLECTION_ULTRA_BATCH_JOBS)
    try:
        query = jobs_ref.where("created_at", ">=", start_ts).where(
            "created_at", "<=", end_ts
        )
        jobs = list(query.stream())
    except Exception as e:
        logger.warning(
            "Query por created_at falhou (índice composto pode ser necessário): %s. "
            "Varrendo coleção e filtrando em memória.",
            e,
        )
        jobs = [
            d
            for d in jobs_ref.stream()
            if d.to_dict()
            and _timestamp_in_range(
                d.to_dict().get("created_at"), start_ts, end_ts
            )
        ]

    sum_success = 0
    sum_failure = 0
    completed_count = 0
    final_count = 0
    for doc in jobs:
        data = doc.to_dict() or {}
        status = (data.get("status") or "").lower()
        sum_success += data.get("successCount") or 0
        sum_failure += data.get("failureCount") or 0
        if status in ("completed", "failed"):
            final_count += 1
            if status == "completed":
                completed_count += 1

    denom_files = sum_success + sum_failure
    success_rate_pct = (
        (sum_success / denom_files * 100.0) if denom_files > 0 else 0.0
    )
    jobs_completed_rate_pct = (
        (completed_count / final_count * 100.0) if final_count > 0 else 0.0
    )
    return success_rate_pct, jobs_completed_rate_pct, sum_success + sum_failure


def _timestamp_in_range(
    ts: Any, start: datetime, end: datetime
) -> bool:
    if ts is None:
        return False
    if hasattr(ts, "timestamp"):
        t = ts.timestamp()
    else:
        return False
    return start.timestamp() <= t <= end.timestamp()


def run_monthly_aggregation(
    db: firestore.Client,
    month_key: str,
    closed: bool,
) -> None:
    parts = month_key.split("-")
    if len(parts) != 2:
        raise ValueError(f"month_key deve ser YYYY-MM, recebido: {month_key}")
    year, month = int(parts[0]), int(parts[1])
    date_list = _month_range(year, month)
    start_ts, end_ts = _get_month_bounds(year, month)

    total_assessors = _read_total_assessors(db)

    digital_uids, digital_team_size = _load_digital_uids(db)

    active_uids = _collect_active_uids(db, date_list)
    digital_uids_active = _collect_active_uids(db, date_list, filter_uids=digital_uids)

    mau = len(active_uids)
    digital_mau = len(digital_uids_active)
    mau_percent = (mau / total_assessors * 100.0) if total_assessors else 0.0
    digital_mau_percent = (
        (digital_mau / digital_team_size * 100.0) if digital_team_size else 0.0
    )

    prev1 = _prev_month(month_key)
    prev2 = _prev_month(prev1)
    uids_m1 = _get_uids_for_month(db, prev1, "active_uids")
    uids_m2 = _get_uids_for_month(db, prev2, "active_uids")
    d_uids_m1 = _get_uids_for_month(db, prev1, "digital_active_uids")
    d_uids_m2 = _get_uids_for_month(db, prev2, "digital_active_uids")

    persistence = _compute_persistence(active_uids, uids_m1, uids_m2)
    digital_persistence = _compute_persistence(digital_uids_active, d_uids_m1, d_uids_m2)

    total_analyses, ultra_total = _compute_volume_and_ultra_files(db, date_list)
    digital_total_analyses = _compute_digital_volume(db, date_list, digital_uids)
    pct_volume_ultra_batch = (
        (ultra_total / total_analyses * 100.0) if total_analyses else 0.0
    )

    success_rate_pct, jobs_completed_rate_pct, _ = _compute_quality_and_scale(
        db, start_ts, end_ts
    )

    adoption_payload: dict = {
        "mau": mau,
        "mau_percent": round(mau_percent, 2),
    }
    if closed:
        adoption_payload["active_uids"] = list(active_uids)
        adoption_payload["digital_active_uids"] = list(digital_uids_active)

    payload: dict[str, Any] = {
        "month": month_key,
        "closed": closed,
        "adoption": adoption_payload,
        "volume": {"total_analyses": total_analyses},
        "persistence": {"users_3m_streak": persistence},
        "quality": {
            "ultra_batch_success_rate_pct": round(success_rate_pct, 2),
            "ultra_batch_jobs_completed_rate_pct": round(jobs_completed_rate_pct, 2),
        },
        "scale": {"pct_volume_ultra_batch": round(pct_volume_ultra_batch, 2)},
        "digital": {
            "mau": digital_mau,
            "mau_percent": round(digital_mau_percent, 2),
            "total_analyses": digital_total_analyses,
            "users_3m_streak": digital_persistence,
        },
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    db.collection(COLLECTION_METRICS_SUMMARY).document(month_key).set(payload)
    logger.info(
        "Agregação mensal: %s closed=%s mau=%d persist=%d digital_mau=%d",
        month_key,
        closed,
        mau,
        persistence,
        digital_mau,
    )


def run_monthly_aggregation_for_scheduler(
    db: firestore.Client,
    current_month: str,
    close_previous_month: bool,
) -> None:
    if close_previous_month:
        prev_month = _prev_month(current_month)
        run_monthly_aggregation(db, prev_month, closed=True)
    run_monthly_aggregation(db, current_month, closed=False)
