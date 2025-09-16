# Documento de Handover e Planejamento: Assistente Corporativo Bob

## 1. Visão Geral Estratégica

### 1.1. Objetivo do Projeto
O "Assistente Corporativo Bob" é uma aplicação de chat com Inteligência Artificial (IA), desenhada para ser um parceiro de produtividade para os colaboradores da 3A RIVA. O sistema foi construído para fornecer respostas precisas e seguras, utilizando uma base de conhecimento interna (via RAG) e, quando necessário, informações da web. A segurança, a conformidade e a proteção de dados foram os pilares centrais do desenvolvimento.

### 1.2. Stack Tecnológica Principal
-   **Framework:** Next.js (com App Router)
-   **Linguagem:** TypeScript
-   **UI:** React, ShadCN UI, Tailwind CSS
-   **Banco de Dados:** Google Firestore
-   **Autenticação:** Firebase Authentication (com provedor Google)
-   **Inteligência Artificial:**
    -   Google Vertex AI Search (RAG - busca interna)
    -   Google Gemini API (Busca web, geração de títulos, etc.)
    -   Google Cloud DLP API (Anonimização de dados sensíveis - PII)
    -   Google Cloud Speech-to-Text API (Transcrição de voz)
-   **Hospedagem:** Firebase App Hosting

---

## 2. Arquitetura e Fluxo de Dados

A aplicação segue uma arquitetura moderna cliente-servidor, utilizando **Server Actions** do Next.js como a ponte entre o frontend e o backend.

### 2.1. Fluxo de uma Consulta Típica
1.  **Frontend (`src/app/chat/page.tsx`):** A interface de chat captura a entrada do usuário (texto, voz ou arquivo). A ação é encapsulada e enviada para o backend via uma Server Action.
2.  **Backend (Server Action - `src/app/actions.ts`):** Este arquivo é o "cérebro" do backend.
    a.  **Segurança (DLP):** A primeira etapa é sempre a anonimização. A função `deidentifyQuery` envia a consulta e o conteúdo dos arquivos para a **Google Cloud DLP API**, que remove dados sensíveis (PII) e retorna uma versão anonimizada.
    b.  **Roteamento da Consulta:** A função `askAssistant` decide qual serviço de IA chamar com base na seleção do usuário:
        -   **Busca Interna (RAG):** Chama `callDiscoveryEngine`, que envia a consulta *já anonimizada* para o **Vertex AI Search**. O Vertex retorna uma resposta contextualizada com base nos documentos da empresa.
        -   **Busca Web:** Chama `callGemini`, que utiliza a **API do Gemini** com a ferramenta de busca do Google habilitada.
    c.  **Resposta:** A resposta da IA é retornada ao frontend.
3.  **Frontend (`src/app/chat/page.tsx`):** A resposta é exibida na interface. A conversa (com a pergunta do usuário já anonimizada) é salva no **Firestore** para compor o histórico do usuário.

### 2.2. Autenticação e Autorização
-   O login é feito via **Firebase Authentication** com o provedor Google.
-   Uma verificação de domínio no backend (`validateAndOnboardUser` em `actions.ts`) garante que apenas e-mails `@3ariva.com.br` e `@3ainvestimentos.com.br` possam acessar o sistema.
-   O perfil do usuário, incluindo seu papel (`admin` ou `user`), é armazenado no **Firestore**.

---

## 3. Guia de Manutenção e Planejamento

Esta seção descreve como realizar manutenções comuns e qual o planejamento para futuras evoluções.

### 3.1. Como Atualizar a Base de Conhecimento (RAG)
-   **Onde:** A base de conhecimento do Vertex AI Search é gerenciada diretamente no **console do Google Cloud**.
-   **Processo:** Para adicionar, remover ou atualizar documentos, acesse o projeto Google Cloud, navegue até "Vertex AI Search" e encontre o Data Store correspondente. Lá, você pode fazer o upload de novos documentos ou remover os antigos. O sistema de RAG irá reindexar o conteúdo automaticamente.
-   **Formatos Suportados:** A base atual suporta nativamente PDF, DOCX, etc.

### 3.2. Como Gerenciar Usuários
-   **Onde:** O gerenciamento de usuários é feito através do **Painel Administrativo** (`/admin`) na própria aplicação.
-   **Funcionalidades:**
    -   **Pré-registrar:** Adicionar e-mails de novos colaboradores e atribuir um papel inicial antes mesmo do primeiro login.
    -   **Alterar Papéis:** Promover um usuário para `admin` ou reverter para `user`.
    -   **Excluir Usuários:** Remover completamente o acesso de um usuário.
-   **Acesso ao Painel:** Apenas usuários com o papel de `admin` podem acessar `/admin`.

### 3.3. Como Colocar o Sistema em Manutenção
-   **Onde:** No Painel Administrativo, na aba "Sistema".
-   **Como Funciona:** Ativar o "Modo de Manutenção" impede que qualquer usuário (exceto administradores) faça login na aplicação. Isso é útil para realizar atualizações críticas ou manutenções programadas no backend.

### 3.4. Monitoramento e Saúde do Sistema
-   **Onde:** O Painel Administrativo é a principal ferramenta de monitoramento.
-   **Principais Métricas a Observar:**
    -   **Latência:** Acompanhe o tempo de resposta médio. Picos podem indicar problemas nas APIs do Google Cloud.
    -   **Falhas na Busca Interna (RAG):** Uma taxa alta pode indicar que a base de conhecimento está desatualizada ou que os usuários estão procurando informações não disponíveis.
    -   **Feedbacks e Alertas Jurídicos:** Devem ser revisados periodicamente para identificar problemas de qualidade nas respostas da IA ou possíveis riscos de conformidade.
-   **Diagnóstico de APIs:** A aba "Sistema" no painel de admin possui uma ferramenta para testar a conectividade com as APIs (DLP, Vertex AI, Gemini) em tempo real.

### 3.5. Planejamento Futuro e Evolução
O projeto foi estruturado para ser escalável. Abaixo estão os próximos passos planejados e as considerações técnicas.

-   **Auditoria e Histórico de Cliente (Pesquisável):**
    -   **Desafio:** Atualmente, os dados são anonimizados e o conteúdo original é descartado, o que impede a busca por um cliente específico no histórico.
    -   **Solução Planejada (descrita em `docs/FILE_ANALYSIS_STRATEGY.md`):** Implementar **criptografia do lado do cliente (Client-Side Encryption)**.
        -   **Como funcionaria:** As mensagens seriam criptografadas no navegador do usuário antes de serem enviadas para o servidor. O conteúdo armazenado no Firestore seria ilegível. Uma chave mestra, gerenciada pelo **Google Cloud KMS**, permitiria que pessoal autorizado (auditores), através de uma interface segura, descriptografasse conversas específicas para fins de auditoria, sem nunca armazenar o dado original de forma legível.
        -   **Impacto:** Esta é uma mudança de arquitetura significativa, mas necessária para funcionalidades avançadas de CRM e conformidade.

-   **Melhoria Contínua da IA:**
    -   **Análise de Feedbacks:** Utilizar os dados da aba "Feedbacks" para criar um conjunto de dados de "prompt/resposta ideal" e realizar fine-tuning (ajuste fino) nos modelos de IA no futuro.
    -   **Novos "Preamble" Especializados:** Assim como o `POSICAO_CONSOLIDADA_PREAMBLE`, novos modos de especialista podem ser criados para outras tarefas repetitivas e bem definidas (ex: análise de DRE, onboarding de novos colaboradores).

---

## 4. Configuração do Ambiente de Desenvolvimento

Para que um novo desenvolvedor possa rodar o projeto localmente, ele precisará:

1.  **Acesso ao Projeto Google Cloud:** Para obter as credenciais.
2.  **Arquivo `.env`:** Criar um arquivo `.env` na raiz do projeto e preenchê-lo com as chaves descritas no `README.md`. As chaves essenciais são:
    -   Credenciais do projeto Firebase (`NEXT_PUBLIC_FIREBASE_*`).
    -   Chave de API do Gemini (`GEMINI_API_KEY`).
    -   A chave da Conta de Serviço em formato JSON Base64 (`SERVICE_ACCOUNT_KEY_INTERNAL`).
3.  **Instalar Dependências e Rodar:**
    ```bash
    npm install
    npm run dev
    ```

Este documento deve fornecer uma base sólida para a transição. Recomenda-se uma sessão de passagem de conhecimento para revisar cada ponto e esclarecer dúvidas.
