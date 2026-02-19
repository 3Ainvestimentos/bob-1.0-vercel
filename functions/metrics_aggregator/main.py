import logging
import os
import re
from datetime import datetime, timezone

import functions_framework
from firebase_admin import credentials, firestore
import firebase_admin

from aggregator import run_monthly_aggregation, run_monthly_aggregation_for_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")


def _get_firestore_client() -> firestore.Client:
    if not firebase_admin._apps:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
    return firestore.client()


@functions_framework.http
def metrics_aggregator(request):
    secret = os.environ.get("SCHEDULER_SECRET", "")
    if secret and request.headers.get("X-Scheduler-Secret") != secret:
        return ("Unauthorized", 401)

    data = request.get_json(silent=True) or {}
    backfill_months = data.get("backfill_months")
    if isinstance(backfill_months, list) and backfill_months:
        months = [m for m in backfill_months if isinstance(m, str) and MONTH_PATTERN.match(m.strip())]
        if not months:
            return ("backfill_months deve ser uma lista de strings YYYY-MM", 400)
        try:
            db = _get_firestore_client()
            for month_key in months:
                run_monthly_aggregation(db, month_key.strip(), closed=True)
            return ("OK", 200)
        except Exception as e:
            logger.exception("Backfill falhou: %s", e)
            return (str(e), 500)

    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    close_previous_month = now.day == 1

    try:
        db = _get_firestore_client()
        run_monthly_aggregation_for_scheduler(
            db,
            current_month=current_month,
            close_previous_month=close_previous_month,
        )
        return ("OK", 200)
    except Exception as e:
        logger.exception("Agregação mensal falhou: %s", e)
        return (str(e), 500)
