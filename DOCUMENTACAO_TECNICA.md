# Documentação Técnica Detalhada - Assistente Corporativo Bob

## 1. Visão Geral do Projeto

### 1.1. Objetivo

O "Assistente Corporativo Bob" é uma aplicação de chat com Inteligência Artificial (IA) projetada para ser um parceiro estratégico para os colaboradores da 3A RIVA. Seu principal objetivo é fornecer respostas precisas e seguras, utilizando uma base de conhecimento interna (via RAG) e, quando necessário, informações da web.

### 1.2. Stack Tecnológica

-   **Framework:** Next.js (com App Router)
-   **Linguagem:** TypeScript
-   **UI:** React, ShadCN UI, Tailwind CSS
-   **Banco de Dados:** Google Firestore (para armazenar conversas, perfis, etc.)
-   **Autenticação:** Firebase Authentication (com provedor Google)
-   **Inteligência Artificial:**
    -   Google Vertex AI Search (para busca em base de conhecimento interna - RAG)
    -   Google Gemini API (para busca na web, geração de títulos e sugestões)
-   **Hospedagem:** Firebase App Hosting

---

## 2. Arquitetura e Fluxo de Dados

A aplicação segue uma arquitetura moderna baseada em componentes React no frontend e Server Actions no backend para comunicação com os serviços de IA.

1.  **Frontend (`src/app/chat/page.tsx`):** O usuário interage com a interface de chat. Todas as ações (enviar mensagem, criar grupo, dar feedback) são capturadas e enviadas para o backend.
2.  **Backend (Server Actions - `src/app/actions.ts`):** Este arquivo centraliza a lógica de negócio. Ele recebe as requisições do frontend, processa-as e chama os serviços externos necessários (Firestore, Vertex AI, Gemini).
3.  **Banco de Dados (Firestore):** Armazena de forma persistente os dados do usuário, como histórico de conversas, grupos, feedbacks e logs de alertas.
4.  **Serviços de IA:**
    -   **Vertex AI Search:** É a principal fonte de respostas. A `callDiscoveryEngine` envia a pergunta do usuário enriquecida com um *preamble* para o motor de busca, que retorna uma resposta contextualizada com base nos documentos internos.
    -   **Gemini API:** Atua como um serviço de apoio para tarefas que não dependem do conhecimento interno, como busca na web, geração de títulos para as conversas e sugestão de novas perguntas.

---

## 3. Configuração do Ambiente

As chaves de API e credenciais de serviço são gerenciadas por meio de variáveis de ambiente em um arquivo `.env` na raiz do projeto.

```bash
# Credenciais do Projeto Firebase (usadas no cliente)
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."

# Chave de API do Google Gemini (usada no servidor)
# Propósito: Geração de títulos, sugestões de perguntas, busca na web.
GEMINI_API_KEY="..."

# Conta de Serviço para Vertex AI Search (usada no servidor)
# Propósito: Autenticar para realizar buscas na base de conhecimento interna (RAG).
# Formato: JSON completo da chave da conta de serviço, em uma única linha.
SERVICE_ACCOUNT_KEY_INTERNAL="..."
```

---

## 4. Segurança e Permissões

A segurança é um pilar central da aplicação, implementada em várias camadas.

### 4.1. Autenticação e Autorização

-   **Provedor:** A autenticação é feita exclusivamente via **Firebase Authentication** com o Provedor Google.
-   **Restrição de Domínio:** O acesso à aplicação é estritamente controlado no frontend (`src/app/page.tsx`). Apenas usuários com e-mails dos domínios `@3ainvestimentos.com.br` e `@3ariva.com.br` podem acessar a página de chat. Qualquer outra conta do Google será desconectada após o login.

### 4.2. Conta de Serviço (`SERVICE_ACCOUNT_KEY_INTERNAL`)

Esta conta de serviço é usada para autenticar as chamadas à API do **Vertex AI Search**.

-   **Propósito:** Permitir que o backend da aplicação consulte o motor de busca do Discovery Engine.
-   **Permissão IAM Essencial:** Para que a conta de serviço funcione, ela **DEVE** ter o seguinte papel (role) no Google Cloud IAM:
    -   `Discovery Engine User` (`roles/discoveryengine.user`)

### 4.3. Regras de Segurança do Firestore

Para proteger os dados no Firestore, é crucial implementar regras de segurança. Embora não haja um arquivo `firestore.rules` no projeto, estas são as regras recomendadas para blindar o acesso:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Regra Geral: Bloqueia todo o acesso por padrão.
    match /{document=**} {
      allow read, write: if false;
    }

    // Permite que usuários autenticados leiam e modifiquem APENAS seus próprios dados.
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Permite que usuários autenticados criem logs de alerta, mas não os leiam ou modifiquem.
    match /dlp_alerts/{alertId} {
      allow create: if request.auth != null;
      allow read, update, delete: if false; // Apenas o backend/admins devem ler.
    }
    match /legal_issue_alerts/{alertId} {
      allow create: if request.auth != null;
      allow read, update, delete: if false; // Apenas o backend/admins devem ler.
    }
    
    // Ninguém pode ler ou escrever na coleção de chats arquivados diretamente.
    match /archived_chats/{chatId} {
        allow read, write: if false;
    }
  }
}
```
**Como implementar:**
1. Crie um arquivo `firestore.rules` na raiz do projeto com este conteúdo.
2. Implante as regras usando a Firebase CLI: `firebase deploy --only firestore:rules`.

### 4.4. Prevenção de Perda de Dados (DLP)
- **Preamble:** A instrução `ASSISTENTE_CORPORATIVO_PREAMBLE` no arquivo `src/app/actions.ts` proíbe explicitamente o modelo de processar ou solicitar dados sensíveis (PII).
- **Log de Alertas:** A função `logDlpAlert` foi criada para registrar possíveis vazamentos de dados no Firestore, embora a detecção no lado do cliente ainda não esteja implementada.

---

## 5. Estrutura do Banco de Dados (Firestore)

A estrutura do Firestore foi projetada para ser escalável e segura, centrada no usuário.

-   `users/{userId}`: Documento principal para cada usuário.
    -   `chats/{chatId}`: Sub-coleção para armazenar o histórico de conversas.
        -   `title`: Título da conversa (gerado por IA).
        -   `messages`: Array de objetos, cada um representando uma mensagem.
        -   `groupId`: ID do projeto ao qual a conversa pertence.
        -   `createdAt`: Timestamp de criação.
    -   `groups/{groupId}`: Sub-coleção para os projetos (pastas) criados pelo usuário.
        -   `name`: Nome do projeto.
        -   `createdAt`: Timestamp de criação.
    -   `feedbacks/{messageId}`: Sub-coleção para armazenar os feedbacks (positivo/negativo) das respostas da IA.
    -   `regenerated_answers/{logId}`: Sub-coleção para registrar quando um usuário pede para regenerar uma resposta, para fins de análise.

-   `dlp_alerts/{alertId}`: Coleção na raiz para registrar alertas de segurança (DLP).
-   `legal_issue_alerts/{alertId}`: Coleção na raiz para registrar alertas de conformidade jurídica.
-   `archived_chats/{chatId}`: Coleção na raiz onde as conversas excluídas são movidas como backup antes da exclusão final.

---

## 6. Histórico de Evolução e Decisões de Design

A aplicação evoluiu significativamente desde sua concepção inicial.

1.  **Fundação:** Começou como um chat simples, com um histórico linear de conversas.
2.  **Organização:** Foram introduzidos "Projetos" (pastas) para permitir que os usuários agrupassem conversas por tema, com funcionalidade de arrastar e soltar (`dnd-kit`).
3.  **Títulos Inteligentes:** A geração de títulos de conversa evoluiu de um simples corte de texto (`substring`) para uma chamada à API Gemini, resultando em títulos contextuais e concisos.
4.  **Interatividade com Respostas:** Foram adicionados recursos como:
    -   Feedback (positivo/negativo).
    -   Regeneração de resposta.
    -   Cópia para a área de transferência.
    -   Reporte de problemas jurídicos.
5.  **Refinamentos de UI/UX:**
    -   Implementação de um popup de "Guias e FAQ" para autoatendimento.
    -   Ajustes de espaçamento e consistência visual nos botões da barra lateral.
    -   Tematização dinâmica que adapta as cores primárias com base no domínio do e-mail do usuário (`@3ariva.com.br` ou `@3ainvestimentos.com.br`).
    -   Design minimalista da caixa de texto, removendo botões desnecessários para uma aparência mais limpa.

---
## 7. Recomendações e Próximos Passos

-   **Implementar Regras do Firestore:** A implantação das regras de segurança sugeridas na seção 4.3 é a prioridade máxima para proteger os dados.
-   **Rotação de Chaves:** Estabelecer uma política para rotacionar `GEMINI_API_KEY` e as chaves da `SERVICE_ACCOUNT_KEY_INTERNAL` periodicamente.
-   **Auditoria de Permissões:** Revisar regularmente as permissões IAM da conta de serviço para garantir que ela siga o princípio de privilégio mínimo.
-   **DLP no Cliente:** Implementar uma verificação no lado do cliente usando uma biblioteca ou regex para detectar PII *antes* que os dados sejam enviados ao backend, fornecendo um alerta imediato ao usuário.
