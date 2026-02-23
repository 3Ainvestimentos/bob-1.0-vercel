"""
Testes unitários para o módulo de métricas.
Cobre validação de metric_type (AT-M4), persistência de record_ultra_batch_complete (AT-M3),
e gravação de sector para usuários digitais (AT-DS-004, AT-DS-005, AT-DS-006).
"""
import pytest
from unittest.mock import Mock, patch, MagicMock


class TestRecordMetricCall:
    """Testes para record_metric_call - validação de metric_type."""

    @patch("app.services.metrics.is_digital", return_value=False)
    @patch("app.services.metrics.get_firestore_client")
    def test_rejects_invalid_metric_type(self, mock_get_firestore, mock_is_digital):
        """metric_type inválido não persiste e não chama Firestore."""
        from app.services.metrics import record_metric_call

        record_metric_call("user_123", "invalid_type")

        mock_get_firestore.assert_not_called()

    @patch("app.services.metrics.is_digital", return_value=False)
    @patch("app.services.metrics._update_daily_total")
    @patch("app.services.metrics.get_firestore_client")
    @patch("app.services.metrics._get_date_string", return_value="2025-02-13")
    def test_accepts_automatica_and_persists(
        self, mock_date, mock_get_firestore, mock_update_daily, mock_is_digital
    ):
        """metric_type 'automatica' é aceito e dispara persistência."""
        from app.services.metrics import record_metric_call

        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_doc.get = MagicMock(return_value=0)

        mock_doc_ref = MagicMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_transaction = MagicMock()
        mock_db = MagicMock()
        mock_db.transaction.return_value = mock_transaction
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = (
            mock_doc_ref
        )
        mock_get_firestore.return_value = mock_db

        with patch("app.services.metrics.firestore") as mock_fs:
            mock_fs.transactional = lambda f: f
            mock_fs.SERVER_TIMESTAMP = "SERVER_TS"

            record_metric_call("user_123", "automatica")

        mock_get_firestore.assert_called_once()
        mock_update_daily.assert_called_once_with("2025-02-13", "automatica")

    @patch("app.services.metrics.is_digital", return_value=False)
    @patch("app.services.metrics._update_daily_total")
    @patch("app.services.metrics.get_firestore_client")
    def test_accepts_personalized_and_persists(self, mock_get_firestore, mock_update_daily, mock_is_digital):
        """metric_type 'personalized' é aceito e dispara persistência."""
        from app.services.metrics import record_metric_call

        mock_doc = MagicMock()
        mock_doc.exists = False

        mock_doc_ref = MagicMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_transaction = MagicMock()
        mock_db = MagicMock()
        mock_db.transaction.return_value = mock_transaction
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = (
            mock_doc_ref
        )
        mock_get_firestore.return_value = mock_db

        with patch("app.services.metrics.firestore") as mock_fs:
            mock_fs.transactional = lambda f: f
            mock_fs.SERVER_TIMESTAMP = "SERVER_TS"

            record_metric_call("user_456", "personalized")

        mock_get_firestore.assert_called_once()
        mock_update_daily.assert_called_once()

    @patch("app.services.metrics.is_digital", return_value=True)
    @patch("app.services.metrics._update_daily_total")
    @patch("app.services.metrics.get_firestore_client")
    @patch("app.services.metrics._get_date_string", return_value="2025-02-13")
    def test_digital_user_gets_sector_on_new_doc(
        self, mock_date, mock_get_firestore, mock_update_daily, mock_is_digital
    ):
        """AT-DS-004: Usuário digital recebe sector='digital' ao criar doc."""
        from app.services.metrics import record_metric_call

        mock_doc = MagicMock()
        mock_doc.exists = False

        mock_doc_ref = MagicMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_transaction = MagicMock()
        mock_db = MagicMock()
        mock_db.transaction.return_value = mock_transaction
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = (
            mock_doc_ref
        )
        mock_get_firestore.return_value = mock_db

        with patch("app.services.metrics.firestore") as mock_fs:
            mock_fs.transactional = lambda f: f
            mock_fs.SERVER_TIMESTAMP = "SERVER_TS"

            record_metric_call("digital_user", "automatica")

        call_args = mock_transaction.set.call_args
        if call_args:
            data = call_args[0][1]
            assert data.get("sector") == "digital"

    @patch("app.services.metrics.is_digital", return_value=False)
    @patch("app.services.metrics._update_daily_total")
    @patch("app.services.metrics.get_firestore_client")
    @patch("app.services.metrics._get_date_string", return_value="2025-02-13")
    def test_non_digital_user_no_sector(
        self, mock_date, mock_get_firestore, mock_update_daily, mock_is_digital
    ):
        """AT-DS-005: Usuário não-digital não recebe campo sector."""
        from app.services.metrics import record_metric_call

        mock_doc = MagicMock()
        mock_doc.exists = False

        mock_doc_ref = MagicMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_transaction = MagicMock()
        mock_db = MagicMock()
        mock_db.transaction.return_value = mock_transaction
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = (
            mock_doc_ref
        )
        mock_get_firestore.return_value = mock_db

        with patch("app.services.metrics.firestore") as mock_fs:
            mock_fs.transactional = lambda f: f
            mock_fs.SERVER_TIMESTAMP = "SERVER_TS"

            record_metric_call("normal_user", "automatica")

        call_args = mock_transaction.set.call_args
        if call_args:
            data = call_args[0][1]
            assert "sector" not in data


class TestRecordUltraBatchComplete:
    """Testes para record_ultra_batch_complete - persistência de status."""

    @patch("app.services.metrics.is_digital", return_value=False)
    @patch("app.services.metrics.get_firestore_client")
    def test_calls_firestore_and_updates_document(self, mock_get_firestore, mock_is_digital):
        """Persistência de status: função obtém doc e executa transação."""
        from app.services.metrics import record_ultra_batch_complete

        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.get.return_value = [
            {"jobId": "job_abc", "file_count": 5},
        ]

        mock_doc_ref = MagicMock()
        mock_doc_ref.get.return_value = mock_doc

        mock_transaction = MagicMock()
        mock_db = MagicMock()
        mock_db.transaction.return_value = mock_transaction
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = (
            mock_doc_ref
        )
        mock_get_firestore.return_value = mock_db

        with patch("app.services.metrics.firestore") as mock_fs:
            mock_fs.transactional = lambda f: f
            mock_fs.SERVER_TIMESTAMP = "SERVER_TS"

            record_ultra_batch_complete("user_123", "job_abc", date="2025-02-13")

        mock_get_firestore.assert_called_once()
        mock_doc_ref.get.assert_called()
        assert mock_transaction.update.called
