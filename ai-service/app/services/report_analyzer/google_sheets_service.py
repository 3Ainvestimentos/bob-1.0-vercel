"""
Serviço de integração Google Sheets para ultra batch.

Criação dinâmica de planilhas (uma por job), escrita incremental assíncrona,
colunas "account number" e "final_message".
Credenciais lidas de GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY (variável de ambiente).
Planilhas criadas em Shared Drive (GOOGLE_SHEETS_SHARED_DRIVE_ID).

Background: backfill e escrita incremental usam funções síncronas (def) executadas
em thread (BackgroundTasks ou run_in_executor) para não bloquear o event loop.
Idempotência: cursor por epoch_ms (created_at_epoch_ms / processedAt_epoch_ms)
para evitar clock skew; fallback para datetime quando epoch ausente.
Clientes Google são criados por chamada (sem cache global) para thread-safety.
"""
import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

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


def _limpar_resposta_para_sheets(text: Optional[str]) -> str:
    """
    Prepara a mensagem para gravação na planilha: remove delimitadores triplos (''' ou ```),
    e asteriscos (*) usados para negrito no WhatsApp, deixando o texto cru para envio por email.
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
    s = s.replace("*", "")
    return s


def _get_credentials() -> Credentials:
    creds_dict = get_google_sheets_credentials()
    return Credentials.from_service_account_info(creds_dict, scopes=SCOPES)


def _create_spreadsheet_sync(
    job_id: str, custom_name: Optional[str] = None
) -> dict[str, str]:
    """
    Cria planilha via Drive API dentro do Shared Drive e configura headers via Sheets API.
    Retorna spreadsheet_id, spreadsheet_url, spreadsheet_name, sheet_name.
    Usa retry com backoff em falhas de rede transitórias (Connection reset, etc.).
    """
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    short_id = job_id[:8] if len(job_id) > 8 else job_id
    spreadsheet_name = custom_name or f"Ultra Batch - {short_id} - {date_str}"
    sheet_name = "Resultados"

    if not SHARED_DRIVE_ID:
        raise ValueError("GOOGLE_SHEETS_SHARED_DRIVE_ID não configurada")

    creds = _get_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    sheets_service = build("sheets", "v4", credentials=creds)

    file_metadata = {
        "name": spreadsheet_name,
        "mimeType": "application/vnd.google-apps.spreadsheet",
        "parents": [SHARED_DRIVE_ID],
    }

    max_attempts = 3
    transient_errors = (ConnectionResetError, ConnectionError, TimeoutError, OSError)

    for attempt in range(max_attempts):
        try:
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
        except transient_errors as e:
            if attempt < max_attempts - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(
                    "Falha de rede ao criar planilha (tentativa %d/%d), retry em %ds: %s",
                    attempt + 1, max_attempts, wait, e,
                )
                time.sleep(wait)
            else:
                raise


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
    created_at_epoch_ms = int(time.time() * 1000)
    db.collection("google_sheets_config").document(job_id).set({
        "spreadsheet_id": result["spreadsheet_id"],
        "spreadsheet_url": result["spreadsheet_url"],
        "spreadsheet_name": result["spreadsheet_name"],
        "sheet_name": result["sheet_name"],
        "enabled": True,
        "created_by": user_id,
        "created_at": fb_firestore.SERVER_TIMESTAMP,
        "created_at_epoch_ms": created_at_epoch_ms,
        "backfill_status": "pending",
    })

    return result


def _write_row_sync(spreadsheet_id: str, sheet_name: str, row: list[str]) -> None:
    service = build("sheets", "v4", credentials=_get_credentials())
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


def _batch_write_rows_sync(spreadsheet_id: str, sheet_name: str, rows: list[list[str]]) -> None:
    service = build("sheets", "v4", credentials=_get_credentials())
    max_retries = 3
    for attempt in range(max_retries):
        try:
            service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=f"{sheet_name}!A:B",
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body={"values": rows},
            ).execute()
            return
        except Exception as e:
            if attempt < max_retries - 1 and "429" in str(e):
                wait = 2 ** (attempt + 1)
                logger.warning("Rate limit Sheets (batch), retry em %ds: %s", wait, e)
                time.sleep(wait)
            else:
                raise


def write_ultra_batch_result_to_sheets_sync(
    job_id: str,
    account_number: str,
    final_message: str,
    processed_at: Optional[datetime] = None,
    processed_at_epoch_ms: Optional[int] = None,
) -> None:
    """
    Escreve uma linha (account_number, final_message) na planilha do job.
    Idempotência: usa created_at_epoch_ms / processed_at_epoch_ms; se epoch ausente, fallback datetime.
    Se created_at existe e processed_at/epoch é None, não escreve (evita duplicação).
    """
    try:
        db = get_firestore_client()
        config_doc = db.collection("google_sheets_config").document(job_id).get()
        if not config_doc.exists:
            return
        config = config_doc.to_dict()
        if not config.get("enabled"):
            return
        created_at_epoch_ms = config.get("created_at_epoch_ms")
        created_at = config.get("created_at")
        if created_at_epoch_ms is not None:
            if processed_at_epoch_ms is None:
                return
            if processed_at_epoch_ms < created_at_epoch_ms:
                return
        else:
            if created_at is not None:
                if processed_at is None:
                    return
                if processed_at < created_at:
                    return
        spreadsheet_id = config["spreadsheet_id"]
        sheet_name = config.get("sheet_name", "Resultados")
        message_limpa = _limpar_resposta_para_sheets(final_message)
        _write_row_sync(spreadsheet_id, sheet_name, [account_number, message_limpa])
        logger.debug("Linha escrita no Sheets job=%s account=%s", job_id, account_number)
    except Exception as e:
        logger.error(
            "Erro ao escrever no Sheets para job %s: %s", job_id, e, exc_info=True
        )


def batch_flush_rows_to_sheets_sync(
    job_id: str,
    rows: list[tuple[str, str, Optional[int]]],
) -> None:
    """
    Escreve um lote de linhas (account, message, processed_at_epoch_ms) na planilha do job.
    Filtra por processed_at_epoch_ms >= config.created_at_epoch_ms quando created_at_epoch_ms existe.
    Quando created_at_epoch_ms é None (config antiga), inclui todas as linhas do buffer.
    """
    if not rows:
        return
    try:
        db = get_firestore_client()
        config_doc = db.collection("google_sheets_config").document(job_id).get()
        if not config_doc.exists:
            return
        config = config_doc.to_dict()
        if not config.get("enabled"):
            return
        created_at_epoch_ms = config.get("created_at_epoch_ms")
        to_write: list[list[str]] = []
        for account_number, final_message, processed_at_epoch_ms in rows:
            if created_at_epoch_ms is not None:
                if processed_at_epoch_ms is None or processed_at_epoch_ms < created_at_epoch_ms:
                    continue
            to_write.append([account_number, _limpar_resposta_para_sheets(final_message)])
        if not to_write:
            return
        spreadsheet_id = config["spreadsheet_id"]
        sheet_name = config.get("sheet_name", "Resultados")
        _batch_write_rows_sync(spreadsheet_id, sheet_name, to_write)
        logger.debug("Batch %d linhas escritas no Sheets job=%s", len(to_write), job_id)
    except Exception as e:
        logger.error(
            "Erro ao batch write no Sheets para job %s: %s", job_id, e, exc_info=True
        )


def backfill_sheets_from_results_sync(job_id: str) -> int:
    """
    Lê resultados do Firestore (apenas processedAt_epoch_ms < config.created_at_epoch_ms, ou fallback datetime)
    e escreve na planilha. Atualiza doc com backfill_status e backfilled_rows.
    """
    db = get_firestore_client()
    config_doc = db.collection("google_sheets_config").document(job_id).get()
    if not config_doc.exists:
        return 0
    config = config_doc.to_dict()
    if not config.get("enabled"):
        return 0
    created_at_epoch_ms = config.get("created_at_epoch_ms")
    created_at = config.get("created_at")
    spreadsheet_id = config["spreadsheet_id"]
    sheet_name = config.get("sheet_name", "Resultados")
    results_ref = db.collection("ultra_batch_jobs").document(job_id).collection("results")
    rows: list[list[str]] = []
    for doc in results_ref.order_by("__name__").stream():
        data = doc.to_dict()
        if not data.get("success"):
            continue
        if created_at_epoch_ms is not None:
            processed_at_epoch_ms = data.get("processedAt_epoch_ms")
            if processed_at_epoch_ms is not None and processed_at_epoch_ms >= created_at_epoch_ms:
                continue
        else:
            processed_at = data.get("processedAt")
            if created_at is not None and processed_at is not None and processed_at >= created_at:
                continue
        account = data.get("accountNumber", "")
        message = data.get("final_message", "")
        if account and message:
            rows.append([account, _limpar_resposta_para_sheets(message)])
    if not rows:
        return 0
    try:
        _batch_write_rows_sync(spreadsheet_id, sheet_name, rows)
        db.collection("google_sheets_config").document(job_id).update({
            "backfill_status": "completed",
            "backfilled_rows": len(rows),
        })
        logger.info("Backfill concluído: %d linhas para job %s", len(rows), job_id)
        return len(rows)
    except Exception as e:
        logger.exception("Backfill falhou para job %s: %s", job_id, e)
        try:
            db.collection("google_sheets_config").document(job_id).update({
                "backfill_status": "failed",
            })
        except Exception:
            pass
        return 0


def get_sheets_config(job_id: str) -> Optional[dict]:
    """Retorna configuração de Sheets para um job, ou None."""
    db = get_firestore_client()
    doc = db.collection("google_sheets_config").document(job_id).get()
    if not doc.exists:
        return None
    return doc.to_dict()
