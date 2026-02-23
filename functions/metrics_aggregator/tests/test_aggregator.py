import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, ".")

from aggregator import (
    _compute_mau,
    _compute_volume_and_ultra_files,
    _compute_digital_analyses,
    _compute_quality_and_scale,
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


def test_compute_mau_empty():
    db = MagicMock()
    db.collection.return_value.document.return_value.collection.return_value.stream.return_value = iter([])
    mau = _compute_mau(db, ["2025-01-01"])
    assert mau == 0


def test_compute_mau_counts_distinct_users_with_activity():
    user1 = _mock_doc({"automatica": 1, "personalized": 0, "ultra_batch_runs": []}, "u1")
    user2 = _mock_doc({"automatica": 0, "personalized": 2, "ultra_batch_runs": []}, "u2")
    user3 = _mock_doc({"automatica": 0, "personalized": 0, "ultra_batch_runs": [{"jobId": "j1"}]}, "u3")
    users_col = MagicMock()
    users_col.stream.return_value = iter([user1, user2, user3])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    mau = _compute_mau(db, ["2025-01-01"])
    assert mau == 3


def test_compute_mau_ignores_users_with_no_activity():
    user1 = _mock_doc({"automatica": 0, "personalized": 0, "ultra_batch_runs": []}, "u1")
    users_col = MagicMock()
    users_col.stream.return_value = iter([user1])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    mau = _compute_mau(db, ["2025-01-01"])
    assert mau == 0


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


def test_compute_digital_analyses_with_digital_users():
    u1 = _mock_doc(
        {"sector": "digital", "automatica": 3, "personalized": 2, "ultra_batch_runs": [{"file_count": 5}]},
        "u1",
    )
    u2 = _mock_doc(
        {"automatica": 10, "personalized": 1, "ultra_batch_runs": []},
        "u2",
    )
    users_col = MagicMock()
    users_col.stream.return_value = iter([u1, u2])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    digital = _compute_digital_analyses(db, ["2025-01-01"])
    assert digital == 3 + 2 + 5


def test_compute_digital_analyses_no_digital_users():
    u1 = _mock_doc(
        {"automatica": 5, "personalized": 1, "ultra_batch_runs": []},
        "u1",
    )
    users_col = MagicMock()
    users_col.stream.return_value = iter([u1])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    digital = _compute_digital_analyses(db, ["2025-01-01"])
    assert digital == 0


def test_compute_digital_analyses_empty():
    users_col = MagicMock()
    users_col.stream.return_value = iter([])
    doc_ref = MagicMock()
    doc_ref.collection.return_value = users_col
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    digital = _compute_digital_analyses(db, ["2025-01-01"])
    assert digital == 0


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


@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_analyses")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._compute_mau")
def test_run_monthly_aggregation_writes_doc(mock_mau, mock_vol, mock_digital, mock_qual):
    mock_mau.return_value = 0
    mock_vol.return_value = (0, 0)
    mock_digital.return_value = 0
    mock_qual.return_value = (0.0, 0.0, 0)
    db = MagicMock()
    summary_ref = MagicMock()
    db.collection.return_value.document.return_value = summary_ref
    run_monthly_aggregation(db, "2025-01", closed=False)
    summary_ref.set.assert_called_once()
    payload = summary_ref.set.call_args[0][0]
    assert payload["month"] == "2025-01"
    assert payload["closed"] is False
    assert "adoption" in payload
    assert payload["adoption"]["mau"] == 0
    assert "volume" in payload
    assert payload["volume"]["total_analyses"] == 0
    assert payload["volume"]["digital_analyses"] == 0
    assert payload["volume"]["rest_analyses"] == 0
    assert "intensity" in payload
    assert "quality" in payload
    assert "scale" in payload
    assert payload["scale"]["pct_volume_ultra_batch"] == 0.0


@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_analyses")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._compute_mau")
def test_run_monthly_aggregation_invariant_total_eq_digital_plus_rest(
    mock_mau, mock_vol, mock_digital, mock_qual
):
    """AT-DS-008: total_analyses === digital_analyses + rest_analyses."""
    mock_mau.return_value = 5
    mock_vol.return_value = (100, 20)
    mock_digital.return_value = 40
    mock_qual.return_value = (95.0, 100.0, 100)
    db = MagicMock()
    summary_ref = MagicMock()
    db.collection.return_value.document.return_value = summary_ref
    run_monthly_aggregation(db, "2025-02", closed=True)
    payload = summary_ref.set.call_args[0][0]
    vol = payload["volume"]
    assert vol["total_analyses"] == 100
    assert vol["digital_analyses"] == 40
    assert vol["rest_analyses"] == 60
    assert vol["total_analyses"] == vol["digital_analyses"] + vol["rest_analyses"]


@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_analyses")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._compute_mau")
def test_run_monthly_aggregation_for_scheduler_current_only(mock_mau, mock_vol, mock_digital, mock_qual):
    mock_mau.return_value = 0
    mock_vol.return_value = (0, 0)
    mock_digital.return_value = 0
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


@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_digital_analyses")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._compute_mau")
def test_run_monthly_aggregation_for_scheduler_closes_previous(mock_mau, mock_vol, mock_digital, mock_qual):
    mock_mau.return_value = 0
    mock_vol.return_value = (0, 0)
    mock_digital.return_value = 0
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
