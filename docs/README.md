# Assistente Corporativo Bob PROD

## 1. Visão Geral

O "Assistente Corporativo Bob" é uma aplicação de chat com Inteligência Artificial (IA) projetada para ser um parceiro estratégico para os colaboradores da 3A RIVA. Seu principal objetivo é fornecer respostas precisas e seguras, utilizando uma base de conhecimento interna (via RAG) e, quando necessário, informações da web.

A aplicação é construída com uma arquitetura moderna, segura e escalável, priorizando a proteção de dados e a experiência do usuário.

## 2. Funcionalidades Principais

-   **Interface de Chat Interativa:** Construída com Next.js e ShadCN UI para uma experiência de usuário fluida e responsiva.
-   **Autenticação Segura:** Utiliza Firebase Authentication com provedor Google, com restrição de acesso a domínios de e-mail específicos da empresa.
-   **Busca em Base de Conhecimento Interna (RAG):** Conecta-se ao Google Vertex AI Search para fornecer respostas baseadas em documentos e dados internos da 3A RIVA.
-   **Busca na Web:** Utiliza a API do Google Gemini para responder a perguntas que requerem informações atualizadas ou externas.
-   **Anonimização de Dados (DLP):** Integra-se com a API do Google Cloud DLP para remover PII (Informações de Identificação Pessoal) de todas as consultas em tempo real, garantindo segurança e conformidade.
-   **Organização de Conversas:** Permite que os usuários agrupem chats em "Projetos" (pastas) com funcionalidade de arrastar e soltar.
-   **Funcionalidades Inteligentes:** Gera títulos de conversa e sugestões de perguntas de acompanhamento usando IA.
-   **Interatividade com Respostas:** Oferece opções para dar feedback (positivo/negativo), regenerar respostas, copiar conteúdo e reportar problemas jurídicos.

## 3. Stack Tecnológica

-   **Framework:** Next.js (com App Router)
-   **Linguagem:** TypeScript
-   **UI:** React, ShadCN UI, Tailwind CSS
-   **Banco de Dados:** Google Firestore
-   **Autenticação:** Firebase Authentication
-   **Inteligência Artificial:**
    -   Google Vertex AI Search
    -   Google Gemini API
    -   Google Cloud DLP API
-   **Hospedagem:** Firebase App Hosting

## 4. Pré-requisitos

-   Node.js (versão 20 ou superior)
-   Conta no Google Cloud com um projeto Firebase ativo.
-   APIs habilitadas no projeto Google Cloud:
    -   Vertex AI Search API
    -   Gemini API (ou Generative Language API)
    -   Cloud Data Loss Prevention (DLP) API
-   Uma conta de serviço com as permissões IAM necessárias (consulte `DOCUMENTACAO_TECNICA.md`).

## 5. Configuração do Ambiente

Antes de rodar o projeto, crie um arquivo `.env` na raiz e preencha-o com as seguintes variáveis:

```bash
# Credenciais do Projeto Firebase (usadas no cliente)
# Obtenha estes valores nas configurações do seu projeto Firebase
NEXT_PUBLIC_FIREBASE_API_KEY="SUA_API_KEY"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="SEU_AUTH_DOMAIN"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="SEU_PROJECT_ID"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="SEU_STORAGE_BUCKET"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="SEU_MESSAGING_SENDER_ID"
NEXT_PUBLIC_FIREBASE_APP_ID="SEU_APP_ID"

# Chave de API do Google Gemini (usada no servidor)
# Propósito: Geração de títulos, sugestões de perguntas, busca na web.
GEMINI_API_KEY="SUA_CHAVE_API_GEMINI"

# Conta de Serviço para Vertex AI Search e Cloud DLP (usada no servidor)
# Propósito: Autenticar para buscas RAG e anonimização DLP.
# Formato: Cole o conteúdo completo do JSON da chave em uma ÚNICA linha.
SERVICE_ACCOUNT_KEY_INTERNAL='{"type": "service_account", "project_id": "...", ...}'
```

Para mais detalhes sobre as permissões necessárias, consulte a [Documentação Técnica](DOCUMENTACAO_TECNICA.md).

## 6. Instalação e Execução

1.  **Instale as dependências:**
    ```bash
    npm install
    ```

2.  **Rode o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```

A aplicação estará disponível em `http://localhost:9002`.

## 7. Estrutura do Projeto

-   `src/app/chat/page.tsx`: Componente principal da página de chat, onde a maior parte da lógica do frontend reside.
-   `src/app/actions.ts`: Arquivo de Server Actions que centraliza toda a lógica de backend, incluindo as chamadas para as APIs de IA (Vertex AI, Gemini, DLP).
-   `src/components/`: Contém todos os componentes React reutilizáveis da aplicação.
-   `src/lib/firebase.ts`: Configuração e inicialização do SDK do Firebase para o cliente.
-   `DOCUMENTACAO_TECNICA.md`: Documentação aprofundada sobre a arquitetura, fluxo de dados, segurança e decisões de design.
-   `FILE_ANALYSIS_STRATEGY.md`: Descreve a estratégia de longo prazo para análise de arquivos e auditoria com criptografia do lado do cliente.
-   `firestore.rules`: Regras de segurança para proteger o acesso ao banco de dados Firestore.
