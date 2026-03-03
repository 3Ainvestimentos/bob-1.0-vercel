import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, call, patch

import pytest

sys.path.insert(0, ".")

from aggregator import (
    _collect_active_uids,
    _compute_digital_volume,
    _compute_persistence,
    _compute_quality_and_scale,
    _compute_volume_and_ultra_files,
    _get_uids_for_month,
    _load_digital_uids,
    _prev_month,
    _read_total_assessors,
    run_monthly_aggregation,
    run_monthly_aggregation_for_scheduler,
)


def _mock_doc(data: dict, doc_id: str = "") -> MagicMock:
    d = MagicMock()
    d.id = doc_id
    d.exists = True
    d.to_dict.return_value = data
    d.get.side_effect = lambda k, default=None: data.get(k, default)
    return d


def _mock_stream(docs: list) -> MagicMock:
    def stream():
        return iter(docs)

    m = MagicMock()
    m.stream.side_effect = stream
    return m


# ─── AT-101 / AT-102: _read_total_assessors ───────────────────────────────────

def test_read_total_assessors_returns_value_from_firestore():
    db = MagicMock()
    doc = _mock_doc({"total_assessors": 200})
    db.collection.return_value.document.return_value.get.return_value = doc
    assert _read_total_assessors(db) == 200


def test_read_total_assessors_fallback_when_doc_missing():
    db = MagicMock()
    missing = MagicMock()
    missing.exists = False
    db.collection.return_value.document.return_value.get.return_value = missing
    assert _read_total_assessors(db) == 139


def test_read_total_assessors_fallback_on_exception():
    db = MagicMock()
    db.collection.return_value.document.return_value.get.side_effect = Exception("timeout")
    assert _read_total_assessors(db) == 139


def test_read_total_assessors_fallback_when_value_invalid():
    db = MagicMock()
    doc = _mock_doc({"total_assessors": -1})
    db.collection.return_value.document.return_value.get.return_value = doc
    assert _read_total_assessors(db) == 139


# ─── _load_digital_uids ───────────────────────────────────────────────────────

def test_load_digital_uids_resolves_emails_to_uids():
    db = MagicMock()
    config_doc = _mock_doc({"emails": ["a@x.com", "b@x.com"]})
    uid_doc_a = MagicMock()
    uid_doc_a.id = "uid_a"
    uid_doc_b = MagicMock()
    uid_doc_b.id = "uid_b"

    def fake_where(field, op, val):
        m = MagicMock()
        result = uid_doc_a if val == "a@x.com" else uid_doc_b
        m.limit.return_value.stream.return_value = iter([result])
        return m

    db.collection.return_value.document.return_value.get.return_value = config_doc
    db.collection.return_value.where.side_effect = fake_where

    uids, size = _load_digital_uids(db)
    assert size == 2
    assert "uid_a" in uids
    assert "uid_b" in uids


def test_load_digital_uids_returns_empty_when_config_missing():
    db = MagicMock()
    missing = MagicMock()
    missing.exists = False
    db.collection.return_value.document.return_value.get.return_value = missing
    uids, size = _load_digital_uids(db)
    assert uids == set()
    assert size == 0


# ─── AT-301 / AT-302 / AT-303: _collect_active_uids ─────────────────────────

def test_collect_active_uids_all_users_no_filter():
    user1 = _mock_doc({"automatica": 1, "personalized": 0, "ultra_batch_runs": []}, "u1")
    user2 = _mock_doc({"automatica": 0, "personalized": 2, "ultra_batch_runs": []}, "u2")
    user3 = _mock_doc({"automatica": 0, "personalized": 0, "ultra_batch_runs": [{"jobId": "j1"}]}, "u3")
    users_col = MagicMock()
    users_col.stream.return_value = iter([user1, user2, user3])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    result = _collect_active_uids(db, ["2025-01-01"])
    assert result == {"u1", "u2", "u3"}


def test_collect_active_uids_with_filter_returns_intersection():
    user1 = _mock_doc({"automatica": 1, "personalized": 0, "ultra_batch_runs": []}, "u1")
    user2 = _mock_doc({"automatica": 0, "personalized": 2, "ultra_batch_runs": []}, "u2")
    users_col = MagicMock()
    users_col.stream.return_value = iter([user1, user2])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    result = _collect_active_uids(db, ["2025-01-01"], filter_uids={"u1"})
    assert result == {"u1"}


def test_collect_active_uids_ignores_users_with_no_activity():
    user1 = _mock_doc({"automatica": 0, "personalized": 0, "ultra_batch_runs": []}, "u1")
    users_col = MagicMock()
    users_col.stream.return_value = iter([user1])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    result = _collect_active_uids(db, ["2025-01-01"])
    assert result == set()


def test_collect_active_uids_empty_date_list():
    db = MagicMock()
    result = _collect_active_uids(db, [])
    assert result == set()


# ─── AT-201 / AT-202: _compute_persistence ───────────────────────────────────

def test_compute_persistence_intersection_of_three_months():
    uids_m = {"u1", "u2", "u3"}
    uids_m1 = {"u1", "u2"}
    uids_m2 = {"u1"}
    assert _compute_persistence(uids_m, uids_m1, uids_m2) == 1


def test_compute_persistence_empty_sets():
    assert _compute_persistence(set(), set(), set()) == 0


def test_compute_persistence_all_in_common():
    uids = {"u1", "u2", "u3"}
    assert _compute_persistence(uids, uids, uids) == 3


# ─── AT-205: _get_uids_for_month ─────────────────────────────────────────────

def test_get_uids_for_month_reads_from_cache():
    db = MagicMock()
    cached_doc = _mock_doc({
        "adoption": {"active_uids": ["u1", "u2"]},
        "closed": True,
    })
    db.collection.return_value.document.return_value.get.return_value = cached_doc
    result = _get_uids_for_month(db, "2025-11", "active_uids")
    assert result == {"u1", "u2"}


def test_get_uids_for_month_fallback_when_no_cache():
    db = MagicMock()
    missing = MagicMock()
    missing.exists = False
    db.collection.return_value.document.return_value.get.return_value = missing

    users_col = MagicMock()
    user1 = _mock_doc({"automatica": 5, "personalized": 0, "ultra_batch_runs": []}, "u1")
    users_col.stream.return_value = iter([user1])
    db.collection.return_value.document.return_value.collection.return_value = users_col

    result = _get_uids_for_month(db, "2025-11", "active_uids")
    assert "u1" in result


# ─── _compute_volume_and_ultra_files ─────────────────────────────────────────

def test_compute_volume_and_ultra_files():
    total_doc = _mock_doc({
        "automatica": 10,
        "personalized": 5,
        "ultra_batch_total_files": 3,
    })
    total_doc.exists = True
    total_ref = MagicMock()
    total_ref.get.return_value = total_doc
    subdoc_total = MagicMock()
    subdoc_total.document.return_value = total_ref
    doc_ref = MagicMock()
    doc_ref.collection.return_value = subdoc_total
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    total_analyses, ultra_total = _compute_volume_and_ultra_files(
        db, ["2025-01-01", "2025-01-02"]
    )
    assert total_analyses == (10 + 5 + 3) * 2
    assert ultra_total == 3 * 2


def test_compute_volume_skips_missing_days():
    total_ref = MagicMock()
    total_ref.get.return_value = MagicMock(exists=False)
    subdoc_total = MagicMock()
    subdoc_total.document.return_value = total_ref
    doc_ref = MagicMock()
    doc_ref.collection.return_value = subdoc_total
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    total_analyses, ultra_total = _compute_volume_and_ultra_files(db, ["2025-01-01"])
    assert total_analyses == 0
    assert ultra_total == 0


# ─── _compute_digital_volume ─────────────────────────────────────────────────

def test_compute_digital_volume_sums_only_digital_uids():
    u1 = _mock_doc(
        {"automatica": 3, "personalized": 2, "ultra_batch_runs": [{"file_count": 5}]},
        "uid_digital",
    )
    u2 = _mock_doc(
        {"automatica": 10, "personalized": 1, "ultra_batch_runs": []},
        "uid_other",
    )
    users_col = MagicMock()
    users_col.stream.return_value = iter([u1, u2])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    total = _compute_digital_volume(db, ["2025-01-01"], digital_uids={"uid_digital"})
    assert total == 3 + 2 + 5


# ─── _compute_quality_and_scale ──────────────────────────────────────────────

def test_compute_quality_and_scale():
    start = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    end = datetime(2025, 1, 31, 23, 59, 59, tzinfo=timezone.utc)
    j1 = _mock_doc({
        "created_at": start,
        "status": "completed",
        "successCount": 90,
        "failureCount": 10,
    })
    j2 = _mock_doc({
        "created_at": start,
        "status": "failed",
        "successCount": 0,
        "failureCount": 5,
    })
    query = MagicMock()
    query.stream.return_value = iter([j1, j2])
    query.where.return_value = query
    db = MagicMock()
    db.collection.return_value.where.return_value = query
    success_pct, jobs_pct, _ = _compute_quality_and_scale(db, start, end)
    assert abs(success_pct - (90 / (90 + 10 + 5) * 100)) < 0.01
    assert jobs_pct == 50.0


# ─── _prev_month ─────────────────────────────────────────────────────────────

def test_prev_month_mid_year():
    assert _prev_month("2026-03") == "2026-02"


def test_prev_month_jan_wraps_to_december():
    assert _prev_month("2026-01") == "2025-12"


# ─── AT-304: run_monthly_aggregation — novo schema ───────────────────────────

@patch("aggregator._read_total_assessors", return_value=139)
@patch("aggregator._load_digital_uids", return_value=({"u1", "u4"}, 7))
@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_volume")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._get_uids_for_month")
@patch("aggregator._collect_active_uids")
def test_run_monthly_aggregation_new_schema(
    mock_uids,
    mock_get_uids,
    mock_vol,
    mock_digital_vol,
    mock_qual,
    mock_load_digital,
    mock_assessors,
):
    mock_uids.side_effect = [
        {"u1", "u2", "u3"},
        {"u1"},
    ]
    mock_get_uids.return_value = set()
    mock_vol.return_value = (100, 20)
    mock_digital_vol.return_value = 30
    mock_qual.return_value = (95.0, 100.0, 100)
    db = MagicMock()
    summary_ref = MagicMock()
    db.collection.return_value.document.return_value = summary_ref

    run_monthly_aggregation(db, "2026-03", closed=False)

    payload = summary_ref.set.call_args[0][0]
    assert "intensity" not in payload
    assert "persistence" in payload
    assert payload["persistence"]["users_3m_streak"] == 0
    assert "digital" in payload
    assert payload["digital"]["mau"] == 1
    assert abs(payload["digital"]["mau_percent"] - (1 / 7 * 100)) < 0.01
    assert payload["digital"]["total_analyses"] == 30
    assert "active_uids" not in payload["adoption"]


@patch("aggregator._read_total_assessors", return_value=139)
@patch("aggregator._load_digital_uids", return_value=({"u1"}, 2))
@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_volume")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._get_uids_for_month")
@patch("aggregator._collect_active_uids")
def test_run_monthly_aggregation_closed_includes_active_uids(
    mock_uids,
    mock_get_uids,
    mock_vol,
    mock_digital_vol,
    mock_qual,
    mock_load_digital,
    mock_assessors,
):
    mock_uids.side_effect = [{"u1", "u2"}, {"u1"}]
    mock_get_uids.return_value = set()
    mock_vol.return_value = (50, 10)
    mock_digital_vol.return_value = 5
    mock_qual.return_value = (98.0, 100.0, 50)
    db = MagicMock()
    summary_ref = MagicMock()
    db.collection.return_value.document.return_value = summary_ref

    run_monthly_aggregation(db, "2026-02", closed=True)

    payload = summary_ref.set.call_args[0][0]
    assert payload["closed"] is True
    assert "active_uids" in payload["adoption"]
    assert set(payload["adoption"]["active_uids"]) == {"u1", "u2"}
    assert "digital_active_uids" in payload["adoption"]


# ─── run_monthly_aggregation_for_scheduler ───────────────────────────────────

@patch("aggregator._read_total_assessors", return_value=139)
@patch("aggregator._load_digital_uids", return_value=(set(), 0))
@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_volume")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._get_uids_for_month")
@patch("aggregator._collect_active_uids")
def test_run_monthly_aggregation_for_scheduler_current_only(
    mock_uids, mock_get_uids, mock_vol, mock_digital_vol, mock_qual, mock_load_digital, mock_assessors,
):
    mock_uids.return_value = set()
    mock_get_uids.return_value = set()
    mock_vol.return_value = (0, 0)
    mock_digital_vol.return_value = 0
    mock_qual.return_value = (0.0, 0.0, 0)
    db = MagicMock()
    summary_ref = MagicMock()
    db.collection.return_value.document.return_value = summary_ref
    run_monthly_aggregation_for_scheduler(
        db, current_month="2025-02", close_previous_month=False
    )
    assert summary_ref.set.call_count == 1
    payload = summary_ref.set.call_args[0][0]
    assert payload["month"] == "2025-02"


@patch("aggregator._read_total_assessors", return_value=139)
@patch("aggregator._load_digital_uids", return_value=(set(), 0))
@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_volume")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._get_uids_for_month")
@patch("aggregator._collect_active_uids")
def test_run_monthly_aggregation_for_scheduler_closes_previous(
    mock_uids, mock_get_uids, mock_vol, mock_digital_vol, mock_qual, mock_load_digital, mock_assessors,
):
    mock_uids.return_value = set()
    mock_get_uids.return_value = set()
    mock_vol.return_value = (0, 0)
    mock_digital_vol.return_value = 0
    mock_qual.return_value = (0.0, 0.0, 0)
    db = MagicMock()
    summary_ref = MagicMock()
    db.collection.return_value.document.return_value = summary_ref
    run_monthly_aggregation_for_scheduler(
        db, current_month="2025-02", close_previous_month=True
    )
    assert summary_ref.set.call_count == 2
    calls = [summary_ref.set.call_args_list[i][0][0] for i in range(2)]
    months = [c["month"] for c in calls]
    assert "2025-01" in months
    assert "2025-02" in months
    closed_jan = next(c for c in calls if c["month"] == "2025-01")
    assert closed_jan["closed"] is True
