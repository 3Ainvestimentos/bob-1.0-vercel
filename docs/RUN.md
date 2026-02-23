# Como rodar o projeto

## Visão geral

- **Frontend (Next.js)**: porta 3000
- **Backend (ai-service / report_analyzer)**: porta 8000 (o frontend usa `NEXT_PUBLIC_PYTHON_SERVICE_URL` ou fallback `http://localhost:8000`)

---

## 1. Backend (ai-service) — report_analyzer

O módulo `report_analyzer` é exposto via FastAPI em `app/api/report.py` (prefixo `/api/report`). Rodar o ai-service sobe todo o backend, incluindo esses endpoints.

### Pré-requisitos

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (recomendado) ou `pip` + `venv`

### Passos

```bash
cd ai-service

# Ambiente virtual e dependências (com uv)
uv venv
source .venv/bin/activate   # Linux/macOS
# No Windows PowerShell: .\.venv\Scripts\Activate.ps1

uv sync

# Variáveis de ambiente: crie .env na pasta ai-service
# Mínimo para análise de relatórios (Gemini):
#   GEMINI_API_KEY=sua_chave_gemini
# Opcional: ENVIRONMENT=development
```

Variáveis usadas pelo report_analyzer / config:

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `GEMINI_API_KEY` | Sim | Chamadas ao Gemini (análise de relatórios) |
| `ENVIRONMENT` | Não | Default: `development` |
| `SERVICE_ACCOUNT_KEY_INTERNAL` | Para upload/Storage | Firebase Admin + Signed URLs |
| `FIREBASE_STORAGE_BUCKET` | Com Storage | Nome do bucket |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY` | Para Google Sheets | Export para planilhas |

Subir o servidor (porta 8000 para o frontend conectar):

```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Health: http://localhost:8000/  
- Docs: http://localhost:8000/docs  
- Endpoints de report: `/api/report/*` (ex.: `/api/report/analyze-auto`, `/api/report/ultra-batch-analyze`, etc.)

### Testes do report_analyzer

```bash
cd ai-service
uv sync --extra dev
uv run pytest app/services/report_analyzer/tests/ -v
```

---

## 2. Frontend (Next.js)

```bash
# Na raiz do projeto
npm install
npm run dev
```

Abre em http://localhost:3000.  
Para apontar para outro backend, defina no `.env.local`:

```bash
NEXT_PUBLIC_PYTHON_SERVICE_URL=http://localhost:8000
```

---

## 3. Rodar projeto completo (backend + frontend)

1. Terminal 1 — backend:
   ```bash
   cd ai-service && uv venv && source .venv/bin/activate && uv sync && uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
2. Terminal 2 — frontend:
   ```bash
   npm run dev
   ```
3. Acessar: http://localhost:3000 (app) e http://localhost:8000/docs (API).

---

## Resumo rápido

| O que | Onde | Comando |
|-------|------|--------|
| Só backend (report_analyzer incluso) | `ai-service/` | `uv run uvicorn main:app --reload --port 8000` |
| Só frontend | raiz | `npm run dev` |
| Testes do report_analyzer | `ai-service/` | `uv run pytest app/services/report_analyzer/tests/ -v` |
