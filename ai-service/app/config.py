"""
Configuração centralizada da aplicação.
Carrega variáveis de ambiente e fornece constantes.
"""
import os
from dotenv import load_dotenv

# Carregar variáveis do .env
load_dotenv()

# API Keys
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY")

# LangSmith
LANGCHAIN_TRACING = os.getenv("LANGSMITH_TRACING", "false").lower() == "true"
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "meeting-analyzer")

# Ambiente
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

# Validação de variáveis obrigatórias
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY não está definida no arquivo .env")

# Configurações do modelo
MODEL_NAME = "gemini-2.0-flash"
MODEL_TEMPERATURE = 0.1

# Configurações de chunking
CHUNK_SIZE = 10000  # caracteres por chunk
CHUNK_OVERLAP = 500

print(f"✅ Configuração carregada: Ambiente={ENVIRONMENT}, LangSmith={LANGCHAIN_TRACING}")

