"""
Entry point da aplicação FastAPI.
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import ENVIRONMENT
from app.api.meeting import router as meeting_router
from app.api.report import router as report_router  
import sys



# Criar instância do FastAPI
app = FastAPI(
    title="Bob AI Services API",
    description="AI-powered using LangGraph",
    version="0.1.0",
    docs_url="/docs" if ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if ENVIRONMENT != "production" else None,
)

# Configurar CORS
allowed_origins = [
    "http://localhost:3000",  # Next.js dev
    "http://localhost:3001",
    "https://www.3arivaconnect.com.br",  # Firebase Hosting
    "https://bob-develop-3a.firebaseapp.com",
    "https://studio--datavisor-44i5m.us-central1.hosted.app",  # Firebase Hosting alternativo
    # Vercel (produção)
    "https://bob1-0.vercel.app",
    "https://bob1-0-jve9aajkq-3-ariva.vercel.app",
    "https://bob-1-0-backup.vercel.app",
]
# Adicionar domínios de produção via variável de ambiente
if os.getenv("ALLOWED_ORIGINS"):
    production_origins = os.getenv("ALLOWED_ORIGINS").split(",")
    # Limpar paths se existirem (CORS só usa domínio + porta)
    allowed_origins.extend([
        origin.strip().split('/')[0]  # Remove paths se existirem
        for origin in production_origins
        if origin.strip()
    ])

# Log para debug (opcional, remover em produção)
print(f"🔍 CORS - Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(meeting_router, prefix="/api/meeting", tags=["meeting"])
app.include_router(report_router, prefix="/api/report", tags=["report"])  # ← ADICIONAR ESTA LINHA

# Health check básico
@app.get("/")
async def root():
    return {
        "service": "Bob AI Services",  # ← ATUALIZAR NOME
        "status": "healthy",
        "environment": ENVIRONMENT,
        "version": "0.1.0"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "environment": ENVIRONMENT}

# Liveness probe para Cloud Run
@app.get("/liveness")
async def liveness():
    return {"status": "alive"}

# Readiness probe para Cloud Run
@app.get("/readiness")
async def readiness():
    try:
        from app.config import GOOGLE_API_KEY
        if not GOOGLE_API_KEY:
            return {"status": "not_ready", "error": "Missing API keys"}
        return {"status": "ready"}
    except Exception as e:
        return {"status": "not_ready", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)



