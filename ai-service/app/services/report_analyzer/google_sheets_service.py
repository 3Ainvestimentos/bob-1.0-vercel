"""
Serviço de integração Google Sheets para ultra batch.

Criação dinâmica de planilhas (uma por job), escrita incremental assíncrona,
colunas "account number" e "final_message".
Credenciais lidas de GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY (variável de ambiente).
Planilhas criadas em Shared Drive (GOOGLE_SHEETS_SHARED_DRIVE_ID).
"""
import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

from firebase_admin import firestore as fb_firestore
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

from app.config import get_firestore_client, get_google_sheets_credentials

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

SHEET_HEADERS = ["account number", "final_message"]

SHARED_DRIVE_ID = os.getenv("GOOGLE_SHEETS_SHARED_DRIVE_ID", "")

_sheets_service_cache: Any = None
_drive_service_cache: Any = None


def _limpar_resposta_para_sheets(text: Optional[str]) -> str:
    """
    Remove delimitadores triplos iniciais e finais (''' ou ```) da mensagem antes de gravar na planilha.
    Retorna string vazia se text for None ou vazio.
    """
    if not text:
        return ""
    s = text.strip()
    for prefix in ("'''", "```"):
        if s.startswith(prefix):
            s = s[len(prefix) :].lstrip()
            break
    for suffix in ("'''", "```"):
        if s.endswith(suffix):
            s = s[: -len(suffix)].rstrip()
            break
    return s


def _get_credentials() -> Credentials:
    creds_dict = get_google_sheets_credentials()
    return Credentials.from_service_account_info(creds_dict, scopes=SCOPES)


def _get_sheets_service():
    global _sheets_service_cache
    if _sheets_service_cache is None:
        _sheets_service_cache = build("sheets", "v4", credentials=_get_credentials())
    return _sheets_service_cache


def _get_drive_service():
    global _drive_service_cache
    if _drive_service_cache is None:
        _drive_service_cache = build("drive", "v3", credentials=_get_credentials())
    return _drive_service_cache


def _create_spreadsheet_sync(
    job_id: str, custom_name: Optional[str] = None
) -> dict[str, str]:
    """
    Cria planilha via Drive API dentro do Shared Drive e configura headers via Sheets API.
    Retorna spreadsheet_id, spreadsheet_url, spreadsheet_name, sheet_name.
    """
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    short_id = job_id[:8] if len(job_id) > 8 else job_id
    spreadsheet_name = custom_name or f"Ultra Batch - {short_id} - {date_str}"
    sheet_name = "Resultados"

    if not SHARED_DRIVE_ID:
        raise ValueError("GOOGLE_SHEETS_SHARED_DRIVE_ID não configurada")

    drive_service = _get_drive_service()
    file_metadata = {
        "name": spreadsheet_name,
        "mimeType": "application/vnd.google-apps.spreadsheet",
        "parents": [SHARED_DRIVE_ID],
    }
    created_file = drive_service.files().create(
        body=file_metadata,
        fields="id,webViewLink",
        supportsAllDrives=True,
    ).execute()

    spreadsheet_id = created_file["id"]
    spreadsheet_url = created_file.get(
        "webViewLink",
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}",
    )

    sheets_service = _get_sheets_service()

    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"updateSheetProperties": {
            "properties": {"sheetId": 0, "title": sheet_name},
            "fields": "title",
        }}]},
    ).execute()

    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A1:B1",
        valueInputOption="RAW",
        body={"values": [SHEET_HEADERS]},
    ).execute()

    logger.info("Planilha criada no Shared Drive: %s (%s)", spreadsheet_name, spreadsheet_id)

    return {
        "spreadsheet_id": spreadsheet_id,
        "spreadsheet_url": spreadsheet_url,
        "spreadsheet_name": spreadsheet_name,
        "sheet_name": sheet_name,
    }


async def create_spreadsheet_for_job(
    job_id: str, user_id: str, custom_name: Optional[str] = None
) -> dict[str, str]:
    """
    Cria planilha e salva configuração no Firestore (google_sheets_config/{jobId}).
    Executa em thread pool para não bloquear o event loop.
    """
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None, _create_spreadsheet_sync, job_id, custom_name
    )

    db = get_firestore_client()
    db.collection("google_sheets_config").document(job_id).set({
        "spreadsheet_id": result["spreadsheet_id"],
        "spreadsheet_url": result["spreadsheet_url"],
        "spreadsheet_name": result["spreadsheet_name"],
        "sheet_name": result["sheet_name"],
        "enabled": True,
        "created_by": user_id,
        "created_at": fb_firestore.SERVER_TIMESTAMP,
    })

    return result


def _write_row_sync(spreadsheet_id: str, sheet_name: str, row: list[str]) -> None:
    service = _get_sheets_service()
    max_retries = 3
    for attempt in range(max_retries):
        try:
            service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=f"{sheet_name}!A:B",
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body={"values": [row]},
            ).execute()
            return
        except Exception as e:
            if attempt < max_retries - 1 and "429" in str(e):
                wait = 2 ** (attempt + 1)
                logger.warning("Rate limit Sheets, retry em %ds: %s", wait, e)
                time.sleep(wait)
            else:
                raise


async def write_ultra_batch_result_to_sheets(
    job_id: str, account_number: str, final_message: str
) -> None:
    """
    Escreve uma linha (account_number, final_message) na planilha do job.
    Busca config no Firestore; se não configurado, retorna silenciosamente.
    """
    try:
        db = get_firestore_client()
        config_doc = db.collection("google_sheets_config").document(job_id).get()

        if not config_doc.exists:
            return
        config = config_doc.to_dict()
        if not config.get("enabled"):
            return

        spreadsheet_id = config["spreadsheet_id"]
        sheet_name = config.get("sheet_name", "Resultados")

        message_limpa = _limpar_resposta_para_sheets(final_message)
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            _write_row_sync,
            spreadsheet_id,
            sheet_name,
            [account_number, message_limpa],
        )
        logger.debug("Linha escrita no Sheets job=%s account=%s", job_id, account_number)

    except Exception as e:
        logger.error(
            "Erro ao escrever no Sheets para job %s: %s", job_id, e, exc_info=True
        )


async def backfill_sheets_from_results(job_id: str) -> int:
    """
    Le resultados ja processados do Firestore e escreve retroativamente na planilha.
    Retorna quantidade de linhas escritas.
    """
    db = get_firestore_client()

    config_doc = db.collection("google_sheets_config").document(job_id).get()
    if not config_doc.exists:
        return 0
    config = config_doc.to_dict()
    if not config.get("enabled"):
        return 0

    spreadsheet_id = config["spreadsheet_id"]
    sheet_name = config.get("sheet_name", "Resultados")

    results_ref = db.collection("ultra_batch_jobs").document(job_id).collection("results")
    results = results_ref.order_by("__name__").stream()

    rows: list[list[str]] = []
    for doc in results:
        data = doc.to_dict()
        if not data.get("success"):
            continue
        account = data.get("accountNumber", "")
        message = data.get("final_message", "")
        if account and message:
            message_limpa = _limpar_resposta_para_sheets(message)
            rows.append([account, message_limpa])

    if not rows:
        return 0

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        _batch_write_rows_sync,
        spreadsheet_id,
        sheet_name,
        rows,
    )
    logger.info("Backfill concluido: %d linhas escritas para job %s", len(rows), job_id)
    return len(rows)


def _batch_write_rows_sync(spreadsheet_id: str, sheet_name: str, rows: list[list[str]]) -> None:
    service = _get_sheets_service()
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_name}!A:B",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()


def get_sheets_config(job_id: str) -> Optional[dict]:
    """Retorna configuração de Sheets para um job, ou None."""
    db = get_firestore_client()
    doc = db.collection("google_sheets_config").document(job_id).get()
    if not doc.exists:
        return None
    return doc.to_dict()
