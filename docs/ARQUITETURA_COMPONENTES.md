
# Arquitetura de Componentes e Responsabilidades - Assistente Bob

Este documento detalha a função de cada componente principal da aplicação, explicando suas responsabilidades e como eles interagem entre si.

---

## 1. Estrutura e Provedores Globais

### `src/app/layout.tsx`
- **Responsabilidade Principal:** É o layout raiz da aplicação. Sua função é configurar os provedores globais que envolvem todas as páginas.
- **Como Funciona:**
    - **`ThemeProvider`**: Gerencia o tema da aplicação (claro/escuro).
    - **`AuthProvider`**: Envolve toda a aplicação para fornecer o contexto de autenticação do usuário.
    - **`Toaster`**: Renderiza as notificações (toasts) que aparecem na interface.
    - Define a fonte principal (`Archivo`) para garantir consistência visual.

### `src/context/AuthProvider.tsx`
- **Responsabilidade Principal:** Gerenciar o estado de autenticação do usuário em toda a aplicação.
- **Como Funciona:**
    - Utiliza o `onAuthStateChanged` do Firebase para ouvir mudanças no estado de login do usuário (login, logout).
    - Armazena o objeto `user` e um estado de `loading` em um Contexto React.
    - Disponibiliza o `user` e o `loading` para qualquer componente filho através do hook `useAuth()`, eliminando a necessidade de verificar a autenticação repetidamente.

---

## 2. Páginas Principais (Rotas)

### `src/app/page.tsx`
- **Responsabilidade Principal:** A página de login da aplicação.
- **Como Funciona:**
    - Apresenta a interface de boas-vindas e o botão "Entrar com Google".
    - Gerencia o fluxo de login:
        1. Chama a função `signInWithPopup` do Firebase ao clicar no botão.
        2. Após o sucesso do login, um `useEffect` detecta a presença do usuário.
        3. Chama a Server Action `validateAndOnboardUser` para verificar o domínio do e-mail e criar um registro no Firestore se for um usuário novo.
        4. Se a validação for bem-sucedida, redireciona o usuário para `/chat`.
        5. Se a validação falhar (ex: domínio não permitido), exibe um toast de erro e desloga o usuário.
    - Também verifica o **Modo de Manutenção** e bloqueia o acesso para usuários não-administradores.

### `src/app/chat/page.tsx` (`ChatPageContent`)
- **Responsabilidade Principal:** É o "cérebro" da interface de chat. Orquestra todos os componentes da tela principal e gerencia o estado da conversa (mensagens, arquivos, grupos).
- **Como Funciona:**
    - **Gerenciamento de Estado:** Utiliza `useState` para controlar o array de `messages`, a `input` do usuário, o `activeChat`, `conversations`, `groups`, `isLoading`, etc.
    - **Lógica de Submissão (`submitQuery`)**:
        1.  Captura a pergunta e os arquivos do `ChatInputForm`.
        2.  Chama a Server Action `askAssistant` para processar a pergunta no backend.
        3.  Atualiza o estado `messages` com a pergunta do usuário e, posteriormente, com a resposta do assistente.
        4.  Lida com o salvamento da conversa no Firestore através da função `saveConversation`.
    - **Interações com a Sidebar:** Gerencia as ações de criar, renomear, excluir e mover conversas e grupos.
    - **Gerenciamento de Feedback e Ações:** Contém a lógica para `handleFeedback`, `handleRegenerate`, `handleCopyToClipboard`, etc., que são passadas como props para o `ChatMessageArea`.
    - **Controle de Fluxo de UI:** Exibe modais para feedback, exclusão, renomeação e o tour de onboarding.

### `src/app/admin/page.tsx`
- **Responsabilidade Principal:** Painel de administração para monitorar a saúde e o uso da aplicação.
- **Como Funciona:**
    - **Autorização:** Acesso restrito a usuários com o papel (`role`) de `admin`.
    - **Coleta de Dados:** Utiliza `useEffect` para chamar diversas Server Actions (`getAdminInsights`, `getUsersWithRoles`, etc.) que buscam dados agregados do Firestore e do Firebase Auth.
    - **Visualização:** Renderiza os dados em abas (`Tabs`) usando componentes de UI como `Card`, `Table` e gráficos (`Recharts`).
    - **Ações Administrativas:** Permite que administradores alterem o modo de manutenção, verifiquem a saúde das APIs, gerenciem usuários e revisem feedbacks/alertas.

---

## 3. Componentes da Interface de Chat

### `src/components/chat/ChatSidebar.tsx`
- **Responsabilidade Principal:** Barra lateral de navegação. Exibe o histórico de conversas e projetos, permitindo a organização e o acesso rápido.
- **Como Funciona:**
    - Recebe `conversations` e `groups` como props da `ChatPageContent`.
    - Renderiza as listas de projetos e conversas avulsas.
    - Utiliza a biblioteca `dnd-kit` para implementar a funcionalidade de arrastar e soltar (drag and drop) para mover conversas e reordenar projetos.
    - Contém os botões "Nova conversa" e "Novo projeto", que acionam funções no componente pai (`ChatPageContent`).
    - Exibe menus de contexto (`DropdownMenu`) para ações como renomear e excluir.

### `src/components/chat/ChatMessageArea.tsx`
- **Responsabilidade Principal:** Exibir a transcrição da conversa (perguntas e respostas).
- **Como Funciona:**
    - Recebe o array `messages` como prop e o itera para renderizar cada mensagem.
    - Diferencia a estilização com base no `role` ('user' ou 'assistant').
    - Utiliza o componente `ReactMarkdown` para renderizar corretamente o conteúdo das respostas da IA, que podem conter formatação Markdown (listas, negrito, tabelas).
    - Exibe os botões de ação abaixo de cada resposta do assistente (feedback, regenerar, copiar, etc.).
    - Mostra um indicador de "pensando..." quando `isLoading` é verdadeiro.
    - Na ausência de mensagens, exibe uma tela de boas-vindas com cards de sugestão.

### `src/components/chat/ChatInputForm.tsx`
- **Responsabilidade Principal:** Fornecer a interface para o usuário inserir sua pergunta (texto, arquivo ou voz).
- **Como Funciona:**
    - Contém o `TextareaAutosize` para a entrada de texto.
    - O botão de anexo (`Paperclip`) aciona um `input` de arquivo oculto.
    - O botão de microfone (`Mic`) gerencia a lógica de gravação de áudio usando a `MediaRecorder` API do navegador e chama a Server Action `transcribeLiveAudio` para converter o áudio em texto.
    - O botão de envio (`SendHorizontal`) submete o formulário, acionando a função `handleSubmit` no `ChatPageContent`.
    - Gerencia o estado dos arquivos selecionados e a fonte de busca (RAG ou Web).

---

## 4. Lógica de Backend

### `src/app/actions.ts`
- **Responsabilidade Principal:** Centralizar toda a lógica de backend da aplicação. Este arquivo funciona como a API do servidor.
- **Como Funciona:**
    - Marcado com `'use server'`, todas as funções exportadas são Server Actions.
    - **`askAssistant`**: Orquestra a resposta a uma pergunta, chamando `deidentifyQuery`, `callDiscoveryEngine` (RAG) ou `callGemini` (Web Search).
    - **`deidentifyQuery`**: Usa a API do Google Cloud DLP para anonimizar PII de uma string.
    - **`callDiscoveryEngine`**: Monta a requisição e chama a API do Vertex AI Search, passando o `preamble` e o contexto dos arquivos.
    - **`callGemini`**: Chama a API do Gemini para busca na web, geração de títulos e sugestões de perguntas.
    - **Funções de Análise e Admin:** Contém a lógica para agregar dados do Firestore e gerar os insights para o painel de administração (`getAdminInsights`, `getUsersWithRoles`, etc.).
    - **Funções de Suporte:** `transcribeLiveAudio` (para voz), `generateTitleForConversation`, `generateSuggestedQuestions`, etc.

---

## 5. Configuração e Utilitários

### `src/lib/firebase.ts`
- **Responsabilidade Principal:** Configurar e inicializar o SDK do Firebase para o lado do cliente.
- **Como Funciona:**
    - Lê as credenciais do Firebase a partir das variáveis de ambiente `NEXT_PUBLIC_*`.
    - Inicializa a aplicação Firebase e exporta as instâncias de `auth`, `db` (Firestore) e `storage`.

### `src/lib/server/firebase.ts`
- **Responsabilidade Principal:** Configurar e inicializar o **Firebase Admin SDK** para o lado do servidor.
- **Como Funciona:**
    - Garante que a inicialização ocorra apenas uma vez (padrão singleton).
    - Lê a chave da conta de serviço (`SERVICE_ACCOUNT_KEY_INTERNAL`) das variáveis de ambiente de forma segura.
    - Exporta funções (`getAuthenticatedFirestoreAdmin`, `getAuthenticatedAuthAdmin`) que fornecem acesso autenticado aos serviços do Firebase no backend.
