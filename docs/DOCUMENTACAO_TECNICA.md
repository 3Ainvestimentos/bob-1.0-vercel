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
    -   Google Cloud DLP API (para anonimização de dados sensíveis)
    -   Google Cloud Speech-to-Text API (para transcrição de áudio)
-   **Hospedagem:** Firebase App Hosting

### 1.3. Principais Bibliotecas e Finalidades
-   `dnd-kit`: Utilizada para implementar a funcionalidade de arrastar e soltar (drag and drop) na barra lateral, permitindo a organização de conversas e projetos.
-   `recharts`: Biblioteca de gráficos utilizada para renderizar as visualizações de dados no painel administrativo (ex: interações por dia, latência, custos).
-   `lucide-react`: Fornece o conjunto de ícones utilizado em toda a interface da aplicação, garantindo consistência visual.
-   `pdf-parse`, `mammoth`, `xlsx`: Conjunto de bibliotecas para processamento de arquivos no backend, responsáveis por extrair o conteúdo de documentos PDF, Word e Excel, respectivamente.
-   `firebase` e `firebase-admin`: SDKs do Firebase para interação do lado do cliente (autenticação, Firestore) e do lado do servidor (operações administrativas).

---

## 2. Arquitetura e Fluxo de Dados

A aplicação segue uma arquitetura moderna baseada em componentes React no frontend e Server Actions no backend para comunicação com os serviços de IA.

1.  **Frontend (`src/app/chat/page.tsx`):** O usuário interage com a interface de chat. Todas as ações (enviar mensagem, criar grupo, dar feedback, anexar arquivos) são capturadas e enviadas para o backend.
2.  **Backend (Server Actions - `src/app/actions.ts`):** Este arquivo centraliza a lógica de negócio. Ele recebe as requisições do frontend, processa-as e chama os serviços externos necessários (Firestore, DLP, Vertex AI, Gemini, Speech-to-Text).
3.  **Banco de Dados (Firestore):** Armazena de forma persistente os dados do usuário, como histórico de conversas, grupos, feedbacks e logs de alertas.
4.  **Serviços de IA:**
    -   **Cloud DLP API:** Atua como a primeira linha de defesa de segurança. A função `deidentifyQuery` intercepta a pergunta do usuário e o conteúdo dos arquivos, removendo dados sensíveis (PII) antes de qualquer outro processamento.
    -   **Vertex AI Search:** É a principal fonte de respostas. A `callDiscoveryEngine` envia a pergunta *já anonimizada* do usuário (e o conteúdo de arquivos) para o motor de busca, que retorna uma resposta contextualizada.
    -   **Gemini API:** Atua como um serviço de apoio para tarefas como busca na web, geração de títulos para as conversas e sugestão de novas perguntas.
    -   **Speech-to-Text API:** A função `transcribeLiveAudio` envia o áudio gravado pelo usuário para a API, que retorna o texto transcrito, permitindo a entrada de comandos por voz.

---

## 3. Funcionalidades Detalhadas

### 3.1. Interação e Consulta

-   **Entrada Multimodal:** O usuário pode fazer perguntas de três formas:
    1.  **Texto:** Digitando diretamente na caixa de chat.
    2.  **Voz:** Gravando um áudio pelo microfone, que é transcrito em tempo real para texto.
    3.  **Arquivos:** Anexando documentos para análise. Os formatos suportados são:
        -   PDF (`.pdf`)
        -   Microsoft Word (`.doc`, `.docx`)
        -   Microsoft Excel (`.xls`, `.xlsx`)
-   **Análise Padrão de Posição Consolidada:** Ao incluir a frase "análise com nosso padrão", o sistema utiliza um *preamble* específico (`POSICAO_CONSOLIDADA_PREAMBLE`) para instruir a IA a extrair e formatar dados de relatórios de investimento da XP de maneira padronizada.

### 3.2. Organização da Interface (Sidebar)

A barra lateral (`ChatSidebar.tsx`) é o centro de organização do usuário.
-   **Projetos (Pastas):** Os usuários podem criar "Projetos" para agrupar conversas relacionadas. É possível criar, renomear e excluir projetos.
-   **Conversas:** Cada chat é listado na barra lateral. Conversas podem estar dentro de um projeto ou serem "avulsas" (não agrupadas).
-   **Arrastar e Soltar (Drag and Drop):** A biblioteca `dnd-kit` é utilizada para permitir que o usuário:
    -   Mova uma conversa para dentro de um projeto.
    -   Mova uma conversa de um projeto para outro.
    -   Remova uma conversa de um projeto (tornando-a avulsa).
    -   Reordene os projetos na lista.

### 3.3. Painel Administrativo (`/admin`)

O acesso ao painel é restrito e verificado no frontend (`src/app/admin/page.tsx`), que confere se o `uid` do usuário logado corresponde ao `ADMIN_UID` definido em `src/types/index.ts`. O painel é dividido em abas:

-   **Análise Geral:** Métricas de uso como total de perguntas, usuários, engajamento, interações por dia/hora e as perguntas mais frequentes.
-   **Análise RAG:** Dados sobre o uso da busca interna vs. busca web, taxa de falha da busca interna e os documentos mais utilizados como fonte.
-   **Latência:** Gráficos e métricas sobre o tempo de resposta da IA (média geral, por tipo de busca, e percentis P95/P99).
-   **Feedbacks:** Tabelas detalhadas com todos os feedbacks (positivos e negativos), permitindo a revisão da pergunta do usuário, da resposta da IA e de comentários adicionais.
-   **Alertas Jurídicos:** Lista todos os alertas de problemas jurídicos reportados pelos usuários, com detalhes da conversa para análise da equipe de conformidade.
-   **Custos:** Apresenta dados (atualmente mockados) sobre os custos da API, com previsão mensal e distribuição por serviço.
-   **Sistema:**
    -   **Modo de Manutenção:** Permite ativar um modo onde apenas o administrador pode logar.
    -   **Diagnóstico de APIs:** Executa um teste em tempo real nas APIs (DLP, Vertex AI, Gemini) para verificar seu status e latência.

---

## 4. Configuração do Ambiente e Chaves

As chaves de API e credenciais são gerenciadas via variáveis de ambiente.

```bash
# Credenciais do Projeto Firebase (usadas no cliente)
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
# ... (demais chaves do Firebase)

# Chave de API do Google Gemini (usada no servidor)
GEMINI_API_KEY="..."

# Conta de Serviço para Vertex AI, DLP e Speech-to-Text (usada no servidor)
# Formato: JSON completo da chave da conta de serviço, em uma única linha.
SERVICE_ACCOUNT_KEY_INTERNAL="..."
```
---

## 5. Segurança e Permissões

### 5.1. Autenticação e Autorização

-   **Provedor:** Autenticação via **Firebase Authentication** com o Provedor Google.
-   **Restrição de Domínio:** Acesso restrito a e-mails `@3ainvestimentos.com.br` e `@3ariva.com.br`, verificado no frontend.

### 5.2. Conta de Serviço (`SERVICE_ACCOUNT_KEY_INTERNAL`)

Esta conta de serviço precisa ter os seguintes papéis no Google Cloud IAM:
-   `Discovery Engine User` (`roles/discoveryengine.user`)
-   `DLP User` (`roles/dlp.user`)
-   `Cloud Speech-to-Text User` (ou um papel mais abrangente como `Editor`)

### 5.3. Regras de Segurança do Firestore

As regras em `firestore.rules` garantem que os usuários só possam ler e escrever seus próprios dados, e que logs de alerta só possam ser criados, mas não lidos ou alterados pelo cliente.

### 5.4. Prevenção de Perda de Dados (DLP)

-   **Anonimização Ativa:** A função `deidentifyQuery` em `src/app/actions.ts` usa a API de DLP para remover PII de todas as consultas e conteúdos de arquivos antes de serem processados pela IA ou salvos.
-   **Preamble de Segurança:** A instrução `ASSISTENTE_CORPORATIVO_PREAMBLE` e `POSICAO_CONSOLIDADA_PREAMBLE` proíbem explicitamente o modelo de processar PII, atuando como uma segunda camada de defesa.

---

## 6. Estrutura do Banco de Dados (Firestore)

-   `users/{userId}`: Documento principal para cada usuário.
    -   `chats/{chatId}`: Sub-coleção com o histórico de conversas (mensagens, título, etc.). As mensagens do usuário são **armazenadas em seu formato anonimizado**.
    -   `groups/{groupId}`: Sub-coleção para os projetos (pastas).
    -   `feedbacks/{messageId}`: Sub-coleção para feedbacks.
    -   `regenerated_answers/{logId}`: Sub-coleção para logs de regeneração.
-   `dlp_alerts/{alertId}`: Coleção na raiz para alertas de segurança.
-   `legal_issue_alerts/{alertId}`: Coleção na raiz para alertas de conformidade.
-   `archived_chats/{chatId}`: Coleção para backup de conversas excluídas.

---
## 7. Preambles e Lógica de Negócio Específica

### 7.1. Preamble Padrão
O `ASSISTENTE_CORPORATIVO_PREAMBLE` define a identidade base do "Bob", suas regras de tom de voz, hierarquia de fontes de conhecimento (arquivos do usuário > RAG) e o procedimento padrão em caso de falha.

### 7.2. Preamble de Posição Consolidada
O `POSICAO_CONSOLIDADA_PREAMBLE` é um conjunto de instruções altamente específico que é ativado quando o usuário menciona "análise com nosso padrão". Ele guia a IA para:
-   Atuar como um especialista em finanças.
-   Extrair dados específicos de páginas exatas de um relatório de investimentos em PDF da XP.
-   Analisar as classes de ativos com melhor e pior performance.
-   Montar uma mensagem formatada para WhatsApp com os dados extraídos e um texto padrão sobre o cenário econômico.

Este preamble demonstra a capacidade do sistema de alternar para um "modo de especialista" com base em uma palavra-chave, aplicando uma lógica de negócio bem definida a um tipo de documento específico.

