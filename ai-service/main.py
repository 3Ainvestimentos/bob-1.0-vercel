"""
Entry point da aplicação FastAPI.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import ENVIRONMENT
from app.api.analysis import router as analysis_router

# Criar instância do FastAPI
app = FastAPI(
    title="Bob AI Services API",
    description="AI-powered using LangGraph",
    version="0.1.0",
)

# Configurar CORS (permitir chamadas do Next.js)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev
        "http://localhost:3001",
        # Adicionar domínio de produção depois
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(analysis_router)

# Health check básico
@app.get("/")
async def root():
    return {
        "service": "Meeting Analyzer",
        "status": "healthy",
        "environment": ENVIRONMENT,
        "version": "0.1.0"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "environment": ENVIRONMENT}