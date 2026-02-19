import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, ".")

from main import metrics_aggregator


def test_rejects_request_without_secret_when_secret_set():
    with patch.dict(os.environ, {"SCHEDULER_SECRET": "mysecret"}):
        request = MagicMock()
        request.headers.get.return_value = None
        response, status = metrics_aggregator(request)
        assert status == 401
        assert "Unauthorized" in response


def test_accepts_request_with_correct_secret():
    with patch.dict(os.environ, {"SCHEDULER_SECRET": "mysecret"}):
        request = MagicMock()
        request.headers.get.return_value = "mysecret"
        with patch("main._get_firestore_client") as mock_db:
            with patch("main.run_monthly_aggregation_for_scheduler") as mock_run:
                mock_db.return_value = MagicMock()
                response, status = metrics_aggregator(request)
                assert status == 200
                assert response == "OK"
                mock_run.assert_called_once()


def test_returns_500_on_aggregation_error():
    with patch.dict(os.environ, {"SCHEDULER_SECRET": ""}):
        request = MagicMock()
        request.headers.get.return_value = None
        with patch("main._get_firestore_client") as mock_db:
            with patch("main.run_monthly_aggregation_for_scheduler") as mock_run:
                mock_db.return_value = MagicMock()
                mock_run.side_effect = RuntimeError("firestore error")
                response, status = metrics_aggregator(request)
                assert status == 500
                assert "firestore error" in response
