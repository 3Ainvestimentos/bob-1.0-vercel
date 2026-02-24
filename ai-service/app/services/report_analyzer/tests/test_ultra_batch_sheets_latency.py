"""
Testes da mitigação de latência: ultra-batch Sheets + whitelist.

- check_whitelist e configure_sheets usam run_in_executor para is_digital.
- configure_sheets retorna backfill_status "pending" e agenda backfill em background.
- get_sheets_config retorna backfill_status e backfilled_rows quando presentes.
- backfill_sync e write_sync com idempotência (created_at / processedAt).
"""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

ai_service_root = Path(__file__).resolve().parent.parent.parent.parent
if str(ai_service_root) not in sys.path:
    sys.path.insert(0, str(ai_service_root))
from main import app

client = TestClient(app)


def test_check_whitelist_uses_run_in_executor_for_is_digital():
    with patch("app.api.report.is_digital", return_value=True) as mock_is_digital:
        with patch("app.api.report.asyncio.get_running_loop") as mock_loop:
            loop = MagicMock()
            fut = asyncio.Future()
            fut.set_result(True)
            loop.run_in_executor = MagicMock(return_value=fut)
            mock_loop.return_value = loop

            response = client.post(
                "/api/report/ultra-batch/check-whitelist",
                json={"user_id": "uid-123"},
            )
            assert response.status_code == 200
            assert response.json() == {"authorized": True}
            mock_is_digital.assert_called_once_with("uid-123")
            loop.run_in_executor.assert_called()
            assert loop.run_in_executor.call_args[0][0] is None
            assert loop.run_in_executor.call_args[0][1] is mock_is_digital
            assert loop.run_in_executor.call_args[0][2] == "uid-123"


def test_configure_sheets_returns_pending_for_new_config():
    with patch("app.api.report.asyncio.get_running_loop") as mock_loop:
        loop = MagicMock()
        fut = asyncio.Future()
        fut.set_result(True)
        loop.run_in_executor = MagicMock(return_value=fut)
        mock_loop.return_value = loop
    with patch("app.api.report.get_firestore_client") as mock_db:
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"user_id": "u1"}
        mock_db.return_value.collection.return_value.document.return_value.get.return_value = mock_doc
    with patch("app.api.report.get_sheets_config", return_value=None):
        with patch("app.api.report.create_spreadsheet_for_job", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {
                "spreadsheet_id": "sid",
                "spreadsheet_url": "https://example.com",
                "spreadsheet_name": "Plan",
            }
            with patch("app.api.report.backfill_sheets_from_results_sync"):
                response = client.post(
                    "/api/report/ultra-batch/configure-sheets",
                    json={"job_id": "job1", "user_id": "u1", "custom_name": None},
                )
                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["spreadsheet_id"] == "sid"
                assert data.get("backfill_status") == "pending"
                assert "backfilled_rows" not in data


def test_configure_sheets_existing_config_returns_without_backfill_status():
    with patch("app.api.report.asyncio.get_running_loop") as mock_loop:
        loop = MagicMock()
        fut = asyncio.Future()
        fut.set_result(True)
        loop.run_in_executor = MagicMock(return_value=fut)
        mock_loop.return_value = loop
    with patch("app.api.report.get_firestore_client"):
        with patch("app.api.report.get_sheets_config") as mock_config:
            mock_config.return_value = {
                "enabled": True,
                "spreadsheet_id": "existing",
                "spreadsheet_url": "https://existing.com",
                "spreadsheet_name": "Existing",
            }
            response = client.post(
                "/api/report/ultra-batch/configure-sheets",
                json={"job_id": "job1", "user_id": "u1", "custom_name": None},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["spreadsheet_id"] == "existing"
            assert "backfill_status" not in data


def test_get_sheets_config_includes_backfill_status_and_backfilled_rows():
    with patch("app.api.report.get_sheets_config") as mock_config:
        mock_config.return_value = {
            "spreadsheet_id": "sid",
            "spreadsheet_url": "https://x.com",
            "spreadsheet_name": "N",
            "enabled": True,
            "backfill_status": "completed",
            "backfilled_rows": 10,
        }
        response = client.get("/api/report/ultra-batch/sheets-config/job1")
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is True
        assert data["backfill_status"] == "completed"
        assert data["backfilled_rows"] == 10


def test_backfill_sync_only_includes_processed_at_before_created_at():
    from app.services.report_analyzer.google_sheets_service import (
        backfill_sheets_from_results_sync,
        _batch_write_rows_sync,
    )
    created_at = datetime(2026, 2, 24, 12, 0, 0, tzinfo=timezone.utc)
    mock_config_doc = MagicMock()
    mock_config_doc.exists = True
    mock_config_doc.to_dict.return_value = {
        "enabled": True,
        "spreadsheet_id": "sid",
        "sheet_name": "Resultados",
        "created_at": created_at,
    }
    doc_before = MagicMock()
    doc_before.to_dict.return_value = {
        "success": True,
        "accountNumber": "acc1",
        "final_message": "msg1",
        "processedAt": datetime(2026, 2, 24, 11, 0, 0, tzinfo=timezone.utc),
    }
    doc_after = MagicMock()
    doc_after.to_dict.return_value = {
        "success": True,
        "accountNumber": "acc2",
        "final_message": "msg2",
        "processedAt": datetime(2026, 2, 24, 13, 0, 0, tzinfo=timezone.utc),
    }
    mock_results = [doc_before, doc_after]
    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.get.return_value = mock_config_doc
    mock_db.collection.return_value.document.return_value.collection.return_value.order_by.return_value.stream.return_value = mock_results

    with patch("app.services.report_analyzer.google_sheets_service.get_firestore_client", return_value=mock_db):
        with patch("app.services.report_analyzer.google_sheets_service._batch_write_rows_sync") as mock_batch:
            n = backfill_sheets_from_results_sync("job1")
            assert n == 1
            mock_batch.assert_called_once()
            rows = mock_batch.call_args[0][2]
            assert len(rows) == 1
            assert rows[0][0] == "acc1"


def test_write_sync_skips_when_processed_at_before_created_at():
    from app.services.report_analyzer.google_sheets_service import write_ultra_batch_result_to_sheets_sync
    created_at = datetime(2026, 2, 24, 12, 0, 0, tzinfo=timezone.utc)
    processed_at = datetime(2026, 2, 24, 11, 0, 0, tzinfo=timezone.utc)
    mock_config_doc = MagicMock()
    mock_config_doc.exists = True
    mock_config_doc.to_dict.return_value = {
        "enabled": True,
        "spreadsheet_id": "sid",
        "sheet_name": "Resultados",
        "created_at": created_at,
    }
    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.get.return_value = mock_config_doc

    with patch("app.services.report_analyzer.google_sheets_service.get_firestore_client", return_value=mock_db):
        with patch("app.services.report_analyzer.google_sheets_service._write_row_sync") as mock_write:
            write_ultra_batch_result_to_sheets_sync("job1", "acc", "msg", processed_at)
            mock_write.assert_not_called()


def test_write_sync_writes_when_processed_at_after_created_at():
    from app.services.report_analyzer.google_sheets_service import write_ultra_batch_result_to_sheets_sync
    created_at = datetime(2026, 2, 24, 12, 0, 0, tzinfo=timezone.utc)
    processed_at = datetime(2026, 2, 24, 13, 0, 0, tzinfo=timezone.utc)
    mock_config_doc = MagicMock()
    mock_config_doc.exists = True
    mock_config_doc.to_dict.return_value = {
        "enabled": True,
        "spreadsheet_id": "sid",
        "sheet_name": "Resultados",
        "created_at": created_at,
    }
    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.get.return_value = mock_config_doc

    with patch("app.services.report_analyzer.google_sheets_service.get_firestore_client", return_value=mock_db):
        with patch("app.services.report_analyzer.google_sheets_service._write_row_sync") as mock_write:
            write_ultra_batch_result_to_sheets_sync("job1", "acc", "msg", processed_at)
            mock_write.assert_called_once()
            assert mock_write.call_args[0][2] == ["acc", "msg"]
