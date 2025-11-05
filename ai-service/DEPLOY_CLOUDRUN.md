# 🚀 Deploy Bob AI Service - Google Cloud Run

## 📋 Visão Geral

Este guia te levará do zero ao deploy completo do Bob AI Service no Google Cloud Run.

**O que você vai fazer:**
- Configurar projeto Google Cloud
- Criar secrets no Secret Manager
- Fazer deploy via script automatizado
- Verificar funcionamento

**Tempo estimado:** 15-20 minutos

---

## 🔧 Pré-requisitos

### 1. Google Cloud CLI
```bash
# Instalar gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Ou via Homebrew (macOS)
brew install google-cloud-sdk
```

### 2. Autenticação
```bash
# Fazer login
gcloud auth login

# Listar projetos disponíveis
gcloud projects list

# Definir projeto (substitua pelo seu ID)
gcloud config set project SEU-PROJETO-ID
```

### 3. APIs Necessárias
```bash
# Habilitar APIs (o script faz isso automaticamente)
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

---

## 🔐 Configurar Secrets

### 1. Criar Secret para Google API Key
```bash
# Método 1: Via arquivo
echo "sua_google_api_key_aqui" | gcloud secrets create GOOGLE_API_KEY_SECRET --data-file=-

# Método 2: Via prompt
gcloud secrets create GOOGLE_API_KEY_SECRET --data-file=-
# Cole sua API key e pressione Ctrl+D
```

### 2. Criar Secret para LangChain API Key
```bash
# Método 1: Via arquivo
echo "sua_langchain_api_key_aqui" | gcloud secrets create LANGCHAIN_API_KEY_SECRET --data-file=-

# Método 2: Via prompt
gcloud secrets create LANGCHAIN_API_KEY_SECRET --data-file=-
# Cole sua API key e pressione Ctrl+D
```

### 3. Verificar Secrets
```bash
# Listar secrets criados
gcloud secrets list

# Verificar se existem
gcloud secrets describe GOOGLE_API_KEY_SECRET
gcloud secrets describe LANGCHAIN_API_KEY_SECRET
```

---

## 🚀 Deploy Automatizado

### 1. Configurar Script
```bash
cd ai-service

# Editar deploy.sh e substituir PROJECT_ID
nano deploy.sh
# Ou: code deploy.sh

# Substituir esta linha:
PROJECT_ID="seu-projeto-id"
# Por:
PROJECT_ID="SEU-PROJETO-ID-REAL"
```

### 2. Tornar Executável
```bash
chmod +x deploy.sh
```

### 3. Executar Deploy
```bash
./deploy.sh
```

**O script vai:**
- ✅ Verificar pré-requisitos
- ✅ Habilitar APIs necessárias
- ✅ Verificar secrets
- ✅ Fazer build da imagem Docker
- ✅ Deploy no Cloud Run
- ✅ Testar health check
- ✅ Exibir URL final

---

## 🔍 Verificação

### 1. Health Check
```bash
# URL será exibida no final do deploy
curl https://SEU-SERVICO-URL/health

# Resposta esperada:
{"status": "healthy", "environment": "production"}
```

### 2. Documentação da API
```bash
# Acessar Swagger UI
open https://SEU-SERVICO-URL/docs
```

### 3. Testar Endpoints
```bash
# Testar reuniões
curl -X POST https://SEU-SERVICO-URL/api/meeting/analyze \
  -H "Content-Type: multipart/form-data" \
  -F "file=@exemplo.docx"

# Testar relatórios
curl -X POST https://SEU-SERVICO-URL/api/report/analyze-auto \
  -H "Content-Type: application/json" \
  -d '{"file_content":"base64...", "file_name":"teste.pdf", "user_id":"test"}'
```

---

## 📊 Monitoramento

### 1. Logs em Tempo Real
```bash
gcloud run logs tail bob-ai-service --region southamerica-east1
```

### 2. Métricas no Console
- Acesse: [Google Cloud Console](https://console.cloud.google.com)
- Vá em: Cloud Run > bob-ai-service
- Visualize: Requests, Latency, Errors

### 3. Health Checks
```bash
# Liveness probe
curl https://SEU-SERVICO-URL/liveness

# Readiness probe  
curl https://SEU-SERVICO-URL/readiness
```

---

## 🔄 Re-Deploy

Para atualizar o serviço:

```bash
# Simplesmente rode o script novamente
./deploy.sh
```

**Cloud Run faz:**
- ✅ Build da nova versão
- ✅ Deploy sem downtime
- ✅ Rollback automático se falhar

---

## 🛠️ Troubleshooting

### Erro: "Project not found"
```bash
# Verificar projeto ativo
gcloud config get-value project

# Definir projeto correto
gcloud config set project SEU-PROJETO-ID
```

### Erro: "Secret not found"
```bash
# Verificar secrets
gcloud secrets list

# Recriar se necessário
gcloud secrets create GOOGLE_API_KEY_SECRET --data-file=-
```

### Erro: "Permission denied"
```bash
# Verificar permissões
gcloud auth list

# Fazer login novamente
gcloud auth login
```

### Erro: "Build failed"
```bash
# Verificar Dockerfile
docker build -t test .

# Verificar logs do build
gcloud builds log --stream
```

### Erro: "Service not responding"
```bash
# Verificar logs
gcloud run logs read bob-ai-service --region southamerica-east1

# Verificar health
curl https://SEU-SERVICO-URL/health
```

---

## 🔧 Configurações Avançadas

### 1. CORS para Produção
```bash
# Deploy com CORS personalizado
gcloud run deploy bob-ai-service \
  --set-env-vars ALLOWED_ORIGINS="https://seu-dominio.com,https://app.seu-dominio.com"
```

### 2. Escalabilidade
```bash
# Aumentar recursos
gcloud run deploy bob-ai-service \
  --memory 4Gi \
  --cpu 4 \
  --max-instances 50
```

### 3. Domínio Personalizado
```bash
# Mapear domínio personalizado
gcloud run domain-mappings create \
  --service bob-ai-service \
  --domain api.seu-dominio.com \
  --region southamerica-east1
```

---

## 📝 Próximos Passos

1. **Configurar CI/CD** (opcional)
   - Conectar GitHub ao Cloud Build
   - Deploy automático a cada push

2. **Monitoramento Avançado**
   - Configurar alertas
   - Métricas customizadas

3. **Segurança**
   - Configurar IAM
   - VPC se necessário

4. **Performance**
   - Otimizar Dockerfile
   - Configurar cache

---

## 🆘 Suporte

- **Logs:** `gcloud run logs tail bob-ai-service --region southamerica-east1`
- **Status:** [Cloud Run Console](https://console.cloud.google.com/run)
- **Documentação:** [Cloud Run Docs](https://cloud.google.com/run/docs)

---

**🎉 Parabéns! Seu Bob AI Service está rodando no Cloud Run!**