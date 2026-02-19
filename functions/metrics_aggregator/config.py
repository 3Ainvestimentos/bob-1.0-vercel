import os
from typing import Final

TOTAL_ASSESSORS: Final[int] = 213
COLLECTION_METRICS: Final[str] = "metrics"
COLLECTION_METRICS_SUMMARY: Final[str] = "metrics_summary"
COLLECTION_ULTRA_BATCH_JOBS: Final[str] = "ultra_batch_jobs"
SUBDOC_USERS: Final[str] = "users"
SUBDOC_TOTAL: Final[str] = "total"
DOC_TOTAL: Final[str] = "total"
TIMEZONE_UTC: Final[str] = "UTC"
MAX_MONTHS_QUERY: Final[int] = int(os.environ.get("METRICS_SUMMARY_MAX_MONTHS", "24"))
