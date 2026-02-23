"""
Testes unitários para digital_whitelist.is_digital.
Cobre: email na lista (True), fora da lista (False), documento ausente, lista vazia.
"""
import pytest
from unittest.mock import MagicMock, patch

from app.services.digital_whitelist import is_digital, clear_cache


@pytest.fixture(autouse=True)
def _clear():
    clear_cache()
    yield
    clear_cache()


def _mock_user_doc(email: str | None, exists: bool = True) -> MagicMock:
    doc = MagicMock()
    doc.exists = exists
    doc.to_dict.return_value = {"email": email} if exists else {}
    return doc


def _mock_config_doc(emails: list[str] | None, exists: bool = True) -> MagicMock:
    doc = MagicMock()
    doc.exists = exists
    doc.to_dict.return_value = {"emails": emails} if exists else {}
    return doc


class TestIsDigital:
    @patch("app.services.digital_whitelist.get_firestore_client")
    def test_returns_true_when_email_in_list(self, mock_db_fn):
        db = MagicMock()
        mock_db_fn.return_value = db

        user_doc = _mock_user_doc("digital@3a.com")
        config_doc = _mock_config_doc(["digital@3a.com", "other@3a.com"])

        def doc_side_effect(doc_id):
            m = MagicMock()
            m.get.return_value = user_doc if doc_id != "digital_team" else config_doc
            return m

        db.collection.return_value.document.side_effect = doc_side_effect

        assert is_digital("uid_123") is True

    @patch("app.services.digital_whitelist.get_firestore_client")
    def test_returns_false_when_email_not_in_list(self, mock_db_fn):
        db = MagicMock()
        mock_db_fn.return_value = db

        user_doc = _mock_user_doc("notdigital@3a.com")
        config_doc = _mock_config_doc(["digital@3a.com"])

        def doc_side_effect(doc_id):
            m = MagicMock()
            m.get.return_value = user_doc if doc_id != "digital_team" else config_doc
            return m

        db.collection.return_value.document.side_effect = doc_side_effect

        assert is_digital("uid_456") is False

    @patch("app.services.digital_whitelist.get_firestore_client")
    def test_returns_false_when_config_doc_missing(self, mock_db_fn):
        db = MagicMock()
        mock_db_fn.return_value = db

        user_doc = _mock_user_doc("user@3a.com")
        config_doc = _mock_config_doc(None, exists=False)

        def doc_side_effect(doc_id):
            m = MagicMock()
            m.get.return_value = user_doc if doc_id != "digital_team" else config_doc
            return m

        db.collection.return_value.document.side_effect = doc_side_effect

        assert is_digital("uid_789") is False

    @patch("app.services.digital_whitelist.get_firestore_client")
    def test_returns_false_when_emails_list_empty(self, mock_db_fn):
        db = MagicMock()
        mock_db_fn.return_value = db

        user_doc = _mock_user_doc("user@3a.com")
        config_doc = _mock_config_doc([])

        def doc_side_effect(doc_id):
            m = MagicMock()
            m.get.return_value = user_doc if doc_id != "digital_team" else config_doc
            return m

        db.collection.return_value.document.side_effect = doc_side_effect

        assert is_digital("uid_empty") is False

    @patch("app.services.digital_whitelist.get_firestore_client")
    def test_returns_false_when_user_doc_missing(self, mock_db_fn):
        db = MagicMock()
        mock_db_fn.return_value = db

        user_doc = _mock_user_doc(None, exists=False)
        config_doc = _mock_config_doc(["digital@3a.com"])

        def doc_side_effect(doc_id):
            m = MagicMock()
            m.get.return_value = user_doc if doc_id != "digital_team" else config_doc
            return m

        db.collection.return_value.document.side_effect = doc_side_effect

        assert is_digital("uid_no_user") is False

    @patch("app.services.digital_whitelist.get_firestore_client")
    def test_case_insensitive_match(self, mock_db_fn):
        db = MagicMock()
        mock_db_fn.return_value = db

        user_doc = _mock_user_doc("Digital@3A.COM")
        config_doc = _mock_config_doc(["digital@3a.com"])

        def doc_side_effect(doc_id):
            m = MagicMock()
            m.get.return_value = user_doc if doc_id != "digital_team" else config_doc
            return m

        db.collection.return_value.document.side_effect = doc_side_effect

        assert is_digital("uid_case") is True
