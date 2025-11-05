"""
Configuração centralizada da aplicação.
Carrega variáveis de ambiente e fornece constantes.
"""
import os
from sre_parse import CHARSET
from dotenv import load_dotenv
from google import genai
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

# Firebase Admin SDK
import firebase_admin
from firebase_admin import credentials, firestore
import logging
import json
import base64
from google.cloud import storage
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

# ==================== CARREGAMENTO DE VARIÁVEIS ====================
# Abordagem simples: carregar .env se existir (para desenvolvimento local)
# Em produção (Cloud Run), as variáveis são injetadas diretamente pelo sistema
load_dotenv(".env")  # Carrega .env se existir (não falha se não existir)
print("📁 Variáveis carregadas de .env (se existir) ou variáveis de ambiente do sistema")

# API Keys
GOOGLE_API_KEY = os.getenv("GEMINI_API_KEY")
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY")

# LangSmith
LANGCHAIN_TRACING = False  # Desabilitado temporariamente

# LangSmith - Projetos Separados
LANGCHAIN_PROJECT_MEETING = os.getenv("LANGCHAIN_PROJECT_MEETING", "meeting-analyzer")
LANGCHAIN_PROJECT_REPORT = os.getenv("LANGCHAIN_PROJECT_REPORT", "report-analyzer")

# Ambiente
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

# Validação de variáveis obrigatórias
def validate_config():
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY não está definida")
    return True

# Configurações do modelo
MODEL_NAME = "gemini-2.5-flash"
MODEL_FLASH = "gemini-2.5-flash"
MODEL_PRO = "gemini-2.5-pro"
MODEL_FLASH_LITE = "gemini-2.5-flash-lite"
MODEL_TEMPERATURE = 0.2

# Configurações de chunking
CHUNK_SIZE = 10000  # caracteres por chunk
CHUNK_OVERLAP = 500

print(f"✅ Configuração carregada: Ambiente={ENVIRONMENT}, LangSmith={LANGCHAIN_TRACING}")

# Chamada da LLM
def get_llm():
    return ChatGoogleGenerativeAI(
        model = MODEL_NAME,         
        temperature = MODEL_TEMPERATURE,
        max_output_tokens = 4096,
        google_api_key = GOOGLE_API_KEY,
        convert_system_message_to_human = True,
        request_timeout = 300,
        max_retries = 2
    )

# ==================== CLIENTE GEMINI (SDK NOVO) ====================

# Em app/config.py, substituir linhas 67-79
def get_gemini_client() -> genai.Client:
    """
    Retorna cliente Gemini configurado (SDK novo).
    """
    return genai.Client(api_key=GOOGLE_API_KEY)

async def generate_content_with_timeout(
    client: genai.Client, 
    model: str, 
    contents: list, 
    timeout_seconds: float = 600.0
):
    """
    Chama generate_content com timeout usando asyncio.wait_for
    """
    import asyncio
    
    async def _generate():
        # Converter para async se necessário
        return client.models.generate_content(
            model=model,
            contents=contents
        )
    
    try:
        response = await asyncio.wait_for(
            _generate(),
            timeout=timeout_seconds
        )
        return response
    except asyncio.TimeoutError:
        print(f"❌ Timeout de {timeout_seconds}s excedido na chamada do Gemini")
        raise Exception(f"Timeout de {timeout_seconds}s excedido")


# Manter retrocompatibilidade (será removido após migração completa)
import google.generativeai as genai_old  # DEPRECATED - será removido
genai_old.configure(api_key=GOOGLE_API_KEY) 

def get_gemini_model():
    """
    Retorna o modelo Gemini configurado (SDK antigo).
    DEPRECATED: Use get_gemini_client() com o SDK novo.
    """
    return genai_old.GenerativeModel(MODEL_NAME)



# ==================== FIREBASE ADMIN SDK ====================

def initialize_firebase_admin():
    """Inicializa o Firebase Admin SDK se ainda não estiver inicializado."""
    if not firebase_admin._apps:
        service_account_key_base64 = os.getenv("SERVICE_ACCOUNT_KEY_INTERNAL")
        
        if service_account_key_base64:
            try:
                decoded_key = base64.b64decode(service_account_key_base64).decode('utf-8')
                creds_dict = json.loads(decoded_key)
                cred = credentials.Certificate(creds_dict)
                print("✅ Firebase Admin SDK inicializado com SERVICE_ACCOUNT_KEY_INTERNAL")
            except Exception as e:
                print(f"❌ Erro ao decodificar SERVICE_ACCOUNT_KEY_INTERNAL: {e}")
                raise ValueError("SERVICE_ACCOUNT_KEY_INTERNAL inválido")
        else:
            print("⚠️  SERVICE_ACCOUNT_KEY_INTERNAL não encontrado, usando credencial default")
            cred = credentials.ApplicationDefault()
        
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK inicializado com sucesso")

def get_firestore_client():
    """
    Retorna instância do cliente Firestore.
    Usa a mesma service account que o Next.js.
    """
    if not firebase_admin._apps:
        initialize_firebase_admin()
    return firestore.client()

def get_firebase_bucket():
    """Retorna uma referência ao bucket do Firebase Storage."""
    if not firebase_admin._apps:
        initialize_firebase_admin()
    
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET")
    if not bucket_name:
        raise ValueError("A variável de ambiente FIREBASE_STORAGE_BUCKET não está definida.")
    
    # ✅ CORREÇÃO: Usar a mesma Service Account do Firebase Admin
    service_account_key_base64 = os.getenv("SERVICE_ACCOUNT_KEY_INTERNAL")
    
    if service_account_key_base64:
        try:
            # Decodificar e parsear a Service Account
            decoded_key = base64.b64decode(service_account_key_base64).decode('utf-8')
            creds_dict = json.loads(decoded_key)
            
            # Criar credenciais para Google Cloud Storage
            storage_creds = service_account.Credentials.from_service_account_info(creds_dict)
            
            # Criar cliente Storage com as credenciais corretas
            client = storage.Client(credentials=storage_creds, project=creds_dict.get('project_id'))
            return client.bucket(bucket_name)
        except Exception as e:
            print(f"❌ Erro ao criar Storage Client com Service Account: {e}")
            raise ValueError(f"Erro ao criar Storage Client: {str(e)}")
    else:
        # Fallback: usar credenciais padrão (pode não funcionar para Signed URLs)
        print("⚠️  SERVICE_ACCOUNT_KEY_INTERNAL não encontrado, usando credencial default")
        client = storage.Client()
        return client.bucket(bucket_name)


