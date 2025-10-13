"""
Teste rápido dos modelos - pode deletar depois
"""
from app.models import AnalyzeRequest, MeetingAnalysisState

# Testar modelo Pydantic
try:
    valid_request = AnalyzeRequest(
        file="data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs...",
        fileName="test.docx",
        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        userId="user123"
    )
    print("✅ AnalyzeRequest válido:", valid_request.fileName)
except Exception as e:
    print("❌ Erro:", e)

# Testar MIME type inválido
try:
    invalid_request = AnalyzeRequest(
        file="data:...",
        fileName="test.pdf",
        mimeType="application/pdf",  # ← Inválido!
        userId="user123"
    )
except ValueError as e:
    print("✅ Validação funcionou! Erro esperado:", str(e))

# Testar TypedDict
state: MeetingAnalysisState = {
    "file_content": "...",
    "file_name": "test.docx",
    "user_id": "user123",
    "raw_text": "",
    "chunks": [],
    "partial_summaries": [],
    "partial_opportunities": [],
    "final_summary": "",
    "final_opportunities": [],
    "metadata": {},
    "error": None
}
print("✅ MeetingAnalysisState criado com sucesso")