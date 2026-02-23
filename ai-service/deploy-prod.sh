#!/bin/bash

# ============================================
# DEPLOY SCRIPT - Bob AI Service PRODUÇÃO
# ============================================

set -e  # Parar em caso de erro

# Configurações para PRODUÇÃO
PROJECT_ID="datavisor-44i5m"  # ← Projeto configurado
SERVICE_NAME="bob-ai-service-prod"
REGION="southamerica-east1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
ENVIRONMENT="production"

echo "🚀 Iniciando deploy do Bob AI Service PRODUÇÃO..."
echo "📋 Projeto: $PROJECT_ID"
echo "🌍 Região: $REGION"
echo "📦 Serviço: $SERVICE_NAME"
echo "🔧 Ambiente: $ENVIRONMENT"

# ============================================
# 1. VALIDAÇÕES INICIAIS
# ============================================

echo ""
echo "🔍 Verificando pré-requisitos..."

# Verificar se gcloud está instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI não encontrado. Instale: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Verificar se está logado
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Faça login no gcloud primeiro:"
    echo "   gcloud auth login"
    exit 1
fi

# Verificar se o projeto está configurado
if [ "$PROJECT_ID" = "seu-projeto-id" ]; then
    echo "❌ Configure o PROJECT_ID no script deploy.sh"
    echo "   Edite a linha: PROJECT_ID=\"seu-projeto-id\""
    exit 1
fi

echo "✅ Pré-requisitos OK"

# ============================================
# 2. CONFIGURAR PROJETO E APIS
# ============================================

echo ""
echo "⚙️ Configurando projeto e APIs..."

# Definir projeto
gcloud config set project $PROJECT_ID

# Habilitar APIs necessárias
echo "📋 Habilitando APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com

echo "✅ APIs habilitadas"

# ============================================
# 3. VERIFICAR SECRETS
# ============================================

echo ""
echo "🔐 Verificando secrets..."




# Defina as origens permitidas aqui (com a vírgula escapada para o gcloud)
ALLOWED_ORIGINS_PROD="http://localhost:3000,http://localhost:3001,https://www.3arivaconnect.com.br,https://studio--datavisor-44i5m.us-central1.hosted.app,https://bob1-0.vercel.app,https://bob-1-0-backup.vercel.app,https://bob-1-0-vercel.vercel.app"
# Nomes dos secrets no GCP
SERVICE_ACCOUNT_SECRET_NAME="SERVICE_ACCOUNT_KEY_INTERNAL" # <-- CONFIRME ESTE NOME
GEMINI_SECRET_NAME="GEMINI_API_KEY" # Exemplo: Gemini_API_KEY_DEV
LANGCHAIN_SECRET_NAME="LANGCHAIN_API_KEY_SECRET" # Exemplo: LANGCHAIN_API_KEY_DEV
GOOGLE_SHEETS_SA_SECRET_NAME="GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY"
GOOGLE_SHEETS_SHARED_DRIVE_ID_SECRET="GOOGLE_SHEETS_SHARED_DRIVE_ID"


# Verificar se secrets existem
if ! gcloud secrets describe ${GEMINI_SECRET_NAME} --project=$PROJECT_ID &> /dev/null; then
    echo "❌ Secret ${GEMINI_SECRET_NAME} não encontrado"
    echo "   Crie com: gcloud secrets create ${GEMINI_SECRET_NAME} --data-file=-"
    exit 1
fi

if ! gcloud secrets describe ${LANGCHAIN_SECRET_NAME} --project=$PROJECT_ID &> /dev/null; then
    echo "❌ Secret ${LANGCHAIN_SECRET_NAME} não encontrado"
    echo "   Crie com: gcloud secrets create ${LANGCHAIN_SECRET_NAME} --data-file=-"
    exit 1
fi

if ! gcloud secrets describe ${SERVICE_ACCOUNT_SECRET_NAME} --project=$PROJECT_ID &> /dev/null; then
    echo "❌ Secret ${SERVICE_ACCOUNT_SECRET_NAME} não encontrado."
    echo "   IMPORTANTE: O valor deste secret deve ser o conteúdo do arquivo JSON da chave, codificado em base64."
    echo "   Crie com o comando: gcloud secrets create ${SERVICE_ACCOUNT_SECRET_NAME} --data-file=<(base64 -w0 /path/to/your-key.json)"
    exit 1
fi

if ! gcloud secrets describe ${GOOGLE_SHEETS_SA_SECRET_NAME} --project=$PROJECT_ID &> /dev/null; then
    echo "❌ Secret ${GOOGLE_SHEETS_SA_SECRET_NAME} não encontrado."
    echo "   Crie com: gcloud secrets create ${GOOGLE_SHEETS_SA_SECRET_NAME} --data-file=path/to/sheets-sa-key.json"
    exit 1
fi

if ! gcloud secrets describe ${GOOGLE_SHEETS_SHARED_DRIVE_ID_SECRET} --project=$PROJECT_ID &> /dev/null; then
    echo "❌ Secret ${GOOGLE_SHEETS_SHARED_DRIVE_ID_SECRET} não encontrado."
    echo "   Crie com: echo -n 'DRIVE_ID' | gcloud secrets create ${GOOGLE_SHEETS_SHARED_DRIVE_ID_SECRET} --data-file=-"
    exit 1
fi

echo "✅ Secrets encontrados"

# ============================================
# 4. BUILD E DEPLOY
# ============================================

echo ""
echo "🔨 Construindo e fazendo deploy..."

# Build da imagem
echo ""
echo "🚀 Construindo e fazendo deploy a partir do código-fonte..."

# Deploy no Cloud Run
echo "🚀 Fazendo deploy no Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 4Gi \
    --cpu 4 \
    --timeout 3600 \
    --min-instances 0 \
    --max-instances 12 \
    --concurrency 150 \
    --no-cpu-throttling \
    --cpu-boost \
    --execution-environment gen2 \
    --set-env-vars "^@^ENVIRONMENT=${ENVIRONMENT}@ALLOWED_ORIGINS=${ALLOWED_ORIGINS_PROD}@FIREBASE_STORAGE_BUCKET=${PROJECT_ID}.firebasestorage.app" \
    --set-secrets "GEMINI_API_KEY=${GEMINI_SECRET_NAME}:latest,LANGCHAIN_API_KEY=${LANGCHAIN_SECRET_NAME}:latest,SERVICE_ACCOUNT_KEY_INTERNAL=${SERVICE_ACCOUNT_SECRET_NAME}:latest,GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY=${GOOGLE_SHEETS_SA_SECRET_NAME}:latest,GOOGLE_SHEETS_SHARED_DRIVE_ID=${GOOGLE_SHEETS_SHARED_DRIVE_ID_SECRET}:latest"

# ============================================
# 5. VERIFICAÇÃO FINAL
# ============================================

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "🌐 URL do serviço:"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --project=$PROJECT_ID --format 'value(status.url)')
echo "   $SERVICE_URL"
echo ""
echo "🔍 Testando health check..."
if curl -s "$SERVICE_URL/health" | grep -q "healthy"; then
    echo "✅ Serviço funcionando!"
else
    echo "⚠️ Serviço pode estar com problemas. Verifique os logs:"
    echo "   gcloud run logs read $SERVICE_NAME --region $REGION"
fi

echo ""
echo "📋 Próximos passos:"
echo "   1. Teste os endpoints: $SERVICE_URL/docs"
echo "   2. Configure CORS se necessário"
echo "   3. Monitore logs: gcloud run logs tail $SERVICE_NAME --region $REGION"
echo ""
echo "🎉 Deploy finalizado!"