"""
Utilitários para geração de Signed URLs do Google Cloud Storage.
"""
from datetime import timedelta
from app.config import get_firebase_bucket


def generate_signed_url_for_upload(
    blob_path: str,
    expiration_hours: int = 1
) -> str:
    """
    Gera Signed URL com permissão WRITE para upload direto ao GCS.
    
    Args:
        blob_path: Caminho do arquivo no GCS (ex: "ultra-batch/batch_id/file.pdf")
        expiration_hours: Horas até a URL expirar (padrão: 1 hora)
    
    Returns:
        Signed URL válida para upload (método PUT)
    
    Exemplo:
        url = generate_signed_url_for_upload("ultra-batch/123/arquivo.pdf")
        # Frontend pode fazer: fetch(url, { method: 'PUT', body: file })
    
    Raises:
        ValueError: Se FIREBASE_STORAGE_BUCKET não estiver configurado
    """
    # Obter bucket usando função existente em config.py
    bucket = get_firebase_bucket()
    
    # Criar referência ao blob
    blob = bucket.blob(blob_path)
    
    # Gerar Signed URL com permissão WRITE (método PUT)
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=expiration_hours),
        method="PUT",
        content_type="application/pdf"
    )
    
    return url