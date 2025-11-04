# Use Python 3.11 slim para menor tamanho
FROM python:3.11-slim

# Instalar dependências do sistema necessárias para PDF e imagens
RUN apt-get update && apt-get install -y \
    poppler-utils \
    curl \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Instalar uv (gerenciador de pacotes Python)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}" 

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de configuração do projeto
COPY pyproject.toml uv.lock ./

# Instalar dependências usando uv
RUN uv sync --frozen --no-dev

# Copiar código da aplicação
COPY . .

# Criar usuário não-root para segurança E instalar uv para o usuário
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app \
    && su - appuser -c "curl -LsSf https://astral.sh/uv/install.sh | sh"

# Adicionar PATH do appuser
ENV PATH="/home/appuser/.local/bin:${PATH}"

USER appuser

# Expor porta 8080 (padrão Cloud Run)
EXPOSE 8080

# Logs sem buffer (essencial para debug no Cloud Run)
ENV PYTHONUNBUFFERED=1

# Comando de inicialização
CMD sh -c 'uv run uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --log-level info'


