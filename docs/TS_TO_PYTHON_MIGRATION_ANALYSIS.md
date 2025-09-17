# Análise de Complexidade e Planejamento: Migração de `actions.ts` (TypeScript) para Python

Este documento detalha a complexidade, os desafios e um plano de migração para mover a lógica de backend, atualmente contida no arquivo `src/app/actions.ts`, de TypeScript para Python.

---

## 1. Resumo Executivo

-   **Complexidade da Migração:** **Extremamente Alta**.
-   **Recomendação:** **Não recomendado** dentro da arquitetura atual. A migração não é uma simples tradução de código. Exigiria uma **mudança fundamental na arquitetura** da aplicação, passando de um modelo integrado com Next.js Server Actions para uma arquitetura de microserviços, com um frontend (Next.js) e um backend (Python) completamente separados.
-   **Justificativa Principal:** A mudança introduz uma complexidade massiva em termos de infraestrutura, comunicação entre serviços, segurança e manutenção.

---

## 2. Análise Detalhada dos Desafios

O arquivo `actions.ts` não é apenas um conjunto de funções; ele é um **endpoint de API integrado ao framework Next.js**, utilizando a funcionalidade "Server Actions". Isso significa que o frontend (React) pode chamar essas funções de backend de forma segura e direta, como se fossem funções locais. Migrar para Python quebra esse modelo fundamental.

### 2.1. Desafio 1: Mudança de Arquitetura (Server Actions para API REST)

-   **Atualmente:** O Next.js gerencia a comunicação cliente-servidor de forma transparente.
-   **Com Python:** Seria necessário criar um servidor web em Python (ex: FastAPI), definir endpoints para cada função, e refatorar completamente o frontend para fazer requisições HTTP (`fetch`) para a nova API.

### 2.2. Desafio 2: Autenticação e Autorização

-   **Atualmente:** As Server Actions têm acesso direto ao contexto de autenticação do Firebase no servidor.
-   **Com Python:** A API Python precisaria validar o token de autenticação do Firebase (JWT) enviado em cada requisição a partir do frontend para garantir que a requisição é legítima e para identificar o usuário.

### 2.3. Desafio 3: Migração de Bibliotecas e SDKs

-   **Atualmente:** O projeto utiliza SDKs específicos para Node.js/TypeScript (`firebase-admin`, `@google-cloud/dlp`, etc.).
-   **Com Python:** Seria necessário encontrar, instalar e reescrever a lógica para usar as bibliotecas equivalentes em Python para **todos** os serviços (Firestore, Auth, DLP, Gemini, Vertex AI, Speech-to-Text, processamento de arquivos PDF/Word/Excel).

### 2.4. Desafio 4: Complexidade de Deploy e Infraestrutura

-   **Atualmente:** O deploy é unificado para o Firebase App Hosting.
-   **Com Python:** Seriam necessários **dois processos de deploy separados**: um para a aplicação Next.js e outro para a aplicação Python (ex: construção de uma imagem Docker e deploy para o Cloud Run). Isso inclui configurar rede, CORS e variáveis de ambiente para ambos.

---

## 3. Planejamento Detalhado da Migração

A seguir, um plano passo a passo para realizar esta migração arquitetônica.

### Fase 1: Configuração do Backend em Python

1.  **Estrutura do Projeto Python:**
    *   Crie uma nova pasta `backend/` na raiz do projeto.
    *   Inicialize um ambiente virtual Python (`python -m venv venv`).
    *   Crie um arquivo `requirements.txt` e adicione as dependências necessárias:
        ```
        fastapi
        uvicorn
        pydantic
        firebase-admin
        google-cloud-dlp
        google-cloud-speech
        google-cloud-aiplatform
        google-generativeai
        python-dotenv
        PyPDF2
        python-docx
        openpyxl
        ```
    *   Instale as dependências: `pip install -r requirements.txt`.

2.  **Criação do Servidor FastAPI (`backend/main.py`):**
    *   Configure uma aplicação FastAPI básica.
    *   Implemente a configuração de CORS para permitir requisições do seu frontend.
    *   Carregue as variáveis de ambiente (especialmente a `SERVICE_ACCOUNT_KEY_INTERNAL`) de um arquivo `.env` local.

3.  **Implementação da Autenticação:**
    *   Crie uma função "dependency" no FastAPI para validar o token de autenticação do Firebase.
    *   O frontend enviará o token JWT do usuário no cabeçalho `Authorization` de cada requisição.
    *   O backend usará o `firebase_admin.auth.verify_id_token()` para validar o token e extrair o `uid` do usuário. Requisições sem um token válido devem ser rejeitadas com um erro 401.

4.  **Migração dos Serviços do Google Cloud:**
    *   Crie um módulo `backend/services/` para encapsular a lógica de cada serviço do Google.
    *   **`google_cloud.py`**: Escreva funções que inicializem os clientes para DLP, Vertex AI, Speech-to-Text e Gemini usando as bibliotecas Python e as credenciais da conta de serviço.
    *   **`firestore.py`**: Escreva funções para interagir com o Firestore (buscar conversas, gerenciar usuários, etc.) usando o SDK `firebase-admin` para Python.
    *   **`file_processing.py`**: Reescreva a lógica de `getFileContent` usando `PyPDF2`, `python-docx` e `openpyxl` para extrair texto dos arquivos.

5.  **Criação dos Endpoints da API:**
    *   Para cada função em `actions.ts`, crie um endpoint FastAPI correspondente.
    *   **Exemplo: `askAssistant`**:
        *   Crie um endpoint `POST /api/v1/assistant/ask`.
        *   Use os modelos Pydantic para definir o corpo da requisição (ex: `query`, `source`, `files`).
        *   O endpoint deve chamar a função de dependência de autenticação para obter o `uid`.
        *   Ele orquestrará as chamadas para os serviços de DLP, processamento de arquivos e, finalmente, Vertex AI ou Gemini, similar à lógica em TypeScript.
        *   Retorne a resposta em um formato JSON claro.
    *   **Exemplo: `getAdminInsights`**:
        *   Crie um endpoint `GET /api/v1/admin/insights`.
        *   Este endpoint deve ter uma lógica de autorização adicional que verifica se o `uid` do token corresponde a um usuário com papel de `admin` no Firestore.
        *   Replique as agregações de dados do Firestore usando a biblioteca Python.
    *   Repita o processo para todas as outras funções (`setUserRole`, `deleteUser`, `getFeedbacks`, etc.).

### Fase 2: Refatoração do Frontend (Next.js)

1.  **Criação de um Cliente de API:**
    *   Crie um novo arquivo, como `src/lib/api-client.ts`.
    *   Use `axios` ou `fetch` para criar funções que fazem requisições para a sua nova API Python.
    *   Cada função no cliente de API deve obter o token de autenticação do usuário logado no Firebase (`user.getIdToken()`) e incluí-lo no cabeçalho `Authorization`.

2.  **Substituição das Server Actions:**
    *   Vá a cada componente que atualmente importa e chama uma função de `src/app/actions.ts` (ex: `ChatPage.tsx`, `AdminPage.tsx`).
    *   Substitua a chamada direta da Server Action pela chamada à função correspondente no seu novo `api-client.ts`.
    *   Envolva a chamada em blocos `try...catch` para gerenciar manualmente os estados de carregamento e erro, que antes eram gerenciados pelo Next.js.
    *   **Exemplo em `ChatPage.tsx`**:
        ```typescript
        // Antes
        const response = await askAssistant(query, options);

        // Depois
        try {
          setIsLoading(true);
          const response = await apiClient.askAssistant(query, options);
          // ... processar a resposta ...
        } catch (error) {
          setError(error.message);
        } finally {
          setIsLoading(false);
        }
        ```
3.  **Remoção de `actions.ts`:** Após garantir que todas as chamadas foram substituídas, o arquivo `src/app/actions.ts` pode ser excluído.

### Fase 3: Infraestrutura e Deploy

1.  **Conteinerização do Backend:**
    *   Crie um `Dockerfile` na pasta `backend/` para conteinerizar sua aplicação FastAPI.
    *   Use uma imagem base do Python, copie o código, instale as dependências de `requirements.txt` e defina o comando para iniciar o servidor `uvicorn`.

2.  **Deploy do Backend:**
    *   Configure o deploy automático para o **Google Cloud Run** a partir do seu repositório.
    *   Configure as variáveis de ambiente no Cloud Run, incluindo a `SERVICE_ACCOUNT_KEY_INTERNAL` (armazenada de forma segura no Secret Manager).

3.  **Atualização do Frontend:**
    *   Adicione uma nova variável de ambiente ao seu frontend Next.js (`NEXT_PUBLIC_API_URL`) com a URL do seu serviço no Cloud Run.
    *   O `api-client.ts` usará essa variável para saber para onde enviar as requisições.

4.  **Configuração de Rede:**
    *   Configure as regras de CORS no seu backend FastAPI para aceitar requisições apenas do domínio da sua aplicação frontend.
    *   Garanta que as regras de firewall permitam a comunicação entre os serviços.

---

## 4. Conclusão Final

A migração é um projeto de engenharia de software de alta complexidade. Manter a lógica no `actions.ts` é a abordagem mais eficiente, segura e de menor custo para a arquitetura atual. Se a utilização de Python for um requisito para *novas* funcionalidades, a abordagem recomendada seria criar um microserviço Python separado para essas funcionalidades específicas e chamá-lo a partir do `actions.ts` existente, em vez de tentar migrar toda a lógica de negócio principal.
