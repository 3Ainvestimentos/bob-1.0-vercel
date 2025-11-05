# Meeting Analyzer AI Service

Serviço Python usando FastAPI + LangGraph para análise de transcrições de reuniões.

## Setup Local

```bash
# Criar e ativar ambiente virtual
uv venv
.\.venv\Scripts\Activate.ps1  # Windows PowerShell

# Instalar dependências
uv sync

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas API keys

# Iniciar servidor
uv run uvicorn main:app --reload
```

## Endpoints

- `GET /` - Health check
- `GET /health` - Status do serviço
- `POST /api/analyze` - Analisar transcrição (TODO: Semana 1, Dia 4)

## Documentação

Acesse `http://localhost:8000/docs` para ver a documentação interativa Swagger.

## Estrutura

```
app/
├── api/          # Endpoints FastAPI
├── models/       # Schemas e tipos
├── services/     # Nós do LangGraph
├── workflow.py   # Definição do grafo
└── config.py     # Configurações
```

## Desenvolvimento

### Instalar dependências de dev

```bash
uv sync --extra dev
```

### Rodar testes

```bash
uv run pytest
```

## Deploy (Cloud Run)

TODO: Adicionar instruções de deploy

