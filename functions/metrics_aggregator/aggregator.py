import calendar
import logging
from datetime import datetime, timezone
from typing import Any

from firebase_admin import firestore

from config import (
    COLLECTION_METRICS,
    COLLECTION_METRICS_SUMMARY,
    COLLECTION_ULTRA_BATCH_JOBS,
    DOC_TOTAL,
    SUBDOC_TOTAL,
    SUBDOC_USERS,
    TOTAL_ASSESSORS,
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


def _compute_mau(db: firestore.Client, date_list: list[str]) -> int:
    seen: set[str] = set()
    for date_str in date_list:
        users_ref = db.collection(COLLECTION_METRICS).document(date_str).collection(SUBDOC_USERS)
        for doc in users_ref.stream():
            data = doc.to_dict() or {}
            automatica = data.get("automatica") or 0
            personalized = data.get("personalized") or 0
            ultra_batch_runs = data.get("ultra_batch_runs") or []
            if automatica > 0 or personalized > 0 or len(ultra_batch_runs) > 0:
                seen.add(doc.id)
    return len(seen)


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


def _compute_digital_analyses(
    db: firestore.Client, date_list: list[str]
) -> int:
    """
    Soma de análises de usuários com sector == 'digital'.
    Para cada usuário digital: automatica + personalized + sum(file_count em ultra_batch_runs).
    """
    digital_total = 0
    for date_str in date_list:
        users_ref = (
            db.collection(COLLECTION_METRICS)
            .document(date_str)
            .collection(SUBDOC_USERS)
        )
        for doc in users_ref.stream():
            data = doc.to_dict() or {}
            if data.get("sector") != "digital":
                continue
            automatica = data.get("automatica") or 0
            personalized = data.get("personalized") or 0
            runs = data.get("ultra_batch_runs") or []
            file_count = sum(r.get("file_count") or 0 for r in runs)
            digital_total += automatica + personalized + file_count
    return digital_total


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

    mau = _compute_mau(db, date_list)
    mau_percent = (mau / TOTAL_ASSESSORS * 100.0) if TOTAL_ASSESSORS else 0.0

    total_analyses, ultra_total = _compute_volume_and_ultra_files(db, date_list)
    digital_analyses = _compute_digital_analyses(db, date_list)
    rest_analyses = max(total_analyses - digital_analyses, 0)

    analyses_per_assessor = (
        (total_analyses / mau) if mau > 0 else 0.0
    )

    (
        success_rate_pct,
        jobs_completed_rate_pct,
        _,
    ) = _compute_quality_and_scale(db, start_ts, end_ts)

    pct_volume_ultra_batch = (
        (ultra_total / total_analyses * 100.0) if total_analyses > 0 else 0.0
    )

    payload: dict[str, Any] = {
        "month": month_key,
        "closed": closed,
        "adoption": {"mau": mau, "mau_percent": round(mau_percent, 2)},
        "volume": {
            "total_analyses": total_analyses,
            "digital_analyses": digital_analyses,
            "rest_analyses": rest_analyses,
        },
        "intensity": {
            "analyses_per_assessor_avg": round(analyses_per_assessor, 2)
        },
        "quality": {
            "ultra_batch_success_rate_pct": round(success_rate_pct, 2),
            "ultra_batch_jobs_completed_rate_pct": round(
                jobs_completed_rate_pct, 2
            ),
        },
        "scale": {"pct_volume_ultra_batch": round(pct_volume_ultra_batch, 2)},
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    ref = db.collection(COLLECTION_METRICS_SUMMARY).document(month_key)
    ref.set(payload)
    logger.info(
        "Agregação mensal escrita: %s (closed=%s) mau=%s volume=%s",
        month_key,
        closed,
        mau,
        total_analyses,
    )


def run_monthly_aggregation_for_scheduler(
    db: firestore.Client,
    current_month: str,
    close_previous_month: bool,
) -> None:
    if close_previous_month:
        year, month = int(current_month[:4]), int(current_month[5:7])
        if month == 1:
            prev_month = f"{year - 1}-12"
        else:
            prev_month = f"{year}-{month - 1:02d}"
        run_monthly_aggregation(db, prev_month, closed=True)
    run_monthly_aggregation(db, current_month, closed=False)
