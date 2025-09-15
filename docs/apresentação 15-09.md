# Apresentação de Funcionalidades - Assistente Corporativo Bob (15/09)

Este documento resume as principais funcionalidades da aplicação "Assistente Corporativo Bob", projetado para ser um parceiro de produtividade e IA para os colaboradores da 3A RIVA.

---

## 1. Interação Principal com o Assistente (Chat)

### 1.1. Entrada Multimodal de Perguntas
O usuário pode interagir com o Bob de três formas flexíveis:
-   **Texto:** Digitando perguntas diretamente na caixa de chat.
-   **Voz:** Clicando no ícone de microfone (🎤) para gravar uma pergunta, que é automaticamente transcrita para texto.
-   **Arquivos:** Anexando documentos para análise contextual. Formatos suportados incluem **PDF, Word (.docx) e Excel (.xlsx)**.

### 1.2. Fontes de Conhecimento e Respostas
O Bob utiliza uma hierarquia inteligente para encontrar a melhor resposta:
1.  **Análise de Arquivos:** Se um arquivo é anexado, a IA prioriza seu conteúdo para responder.
2.  **Base de Conhecimento Interna (RAG):** Utiliza o **Google Vertex AI Search** para buscar respostas em documentos e informações previamente carregadas pela 3A RIVA, garantindo respostas seguras e contextualizadas.
3.  **Busca na Web (Fallback):** Caso a informação não seja encontrada internamente, o Bob oferece a opção "Pesquisar na Web", utilizando a **API do Google Gemini** para buscar dados externos e atualizados.

### 1.3. Ação Especial: Análise Padrão de Relatórios
-   **Comando:** `faça a análise com nosso padrão`
-   **Funcionalidade:** Ao anexar um relatório de posição consolidada da XP e usar este comando, o Bob executa uma análise especializada, extrai dados financeiros chave (rentabilidade, comparação com CDI) e formata uma mensagem de WhatsApp pronta para ser enviada ao cliente, seguindo um padrão de comunicação da empresa.

### 1.4. Interação com as Respostas
Para cada resposta gerada pela IA, o usuário tem um conjunto de ações rápidas:
-   **👍 / 👎 (Feedback):** Avaliar a qualidade da resposta, ajudando a treinar e melhorar o modelo.
-   **🔄 (Gerar Novamente):** Pedir à IA para tentar uma nova abordagem para a mesma pergunta.
-   **📋 (Copiar):** Copiar o texto da resposta para a área de transferência.
-   **🚨 (Informar Problema Jurídico):** Reportar respostas que possam conter informações sensíveis ou legalmente inadequadas, notificando a equipe de conformidade.

---

## 2. Organização e Usabilidade da Interface

### 2.1. Gerenciamento de Conversas e Projetos
A barra lateral (sidebar) permite uma organização eficiente do histórico de chats:
-   **Projetos (Pastas):** Os usuários podem criar "Projetos" para agrupar conversas relacionadas por tema, cliente ou data.
-   **Arrastar e Soltar (Drag and Drop):** A interface permite mover conversas facilmente entre projetos ou reordenar os próprios projetos, oferecendo uma experiência de organização intuitiva.
-   **Gerenciamento:** É possível criar, renomear e excluir tanto conversas individuais quanto projetos.

---

## 3. Segurança e Conformidade (Pilares do Projeto)

### 3.1. Autenticação Segura
-   **Login via Google:** Acesso via contas Google, garantindo um processo de login familiar e seguro.
-   **Restrição de Domínio:** O acesso é estritamente limitado a colaboradores com e-mails `@3ariva.com.br` e `@3ainvestimentos.com.br`, impedindo o acesso de contas externas.

### 3.2. Anonimização de Dados em Tempo Real (DLP)
-   **Proteção de PII:** Antes que qualquer pergunta do usuário ou conteúdo de arquivo seja processado pela IA, ele passa pela API **Google Cloud Data Loss Prevention (DLP)**.
-   **Funcionamento:** A API detecta e remove/anonimiza automaticamente Informações de Identificação Pessoal (PII) como nomes, CPFs e números de telefone, garantindo que a IA nunca tenha acesso a dados sensíveis originais.

---

## 4. Painel Administrativo (`/admin`)

Uma área restrita para administradores com uma visão completa do uso e da saúde do sistema.

### 4.1. Abas de Análise e Métricas
-   **Análise Geral:** Métricas de uso (total de perguntas, usuários, engajamento), interações por dia/hora e as perguntas mais frequentes.
-   **Análise RAG:** Dados sobre o uso da busca interna vs. web, taxa de falha da busca RAG e os documentos mais consultados.
-   **Latência:** Gráficos sobre o tempo de resposta da IA (média geral, por tipo de busca, e percentis P95/P99).
-   **Feedbacks:** Visualização detalhada de todos os feedbacks (positivos e negativos) deixados pelos usuários.
-   **Alertas Jurídicos:** Lista de todos os alertas de conformidade reportados para análise.
-   **Custos:** Dashboard com dados sobre os custos das APIs da Google (Vertex AI, Gemini, DLP).

### 4.2. Configurações do Sistema
-   **Modo de Manutenção:** Permite que administradores coloquem o sistema em modo de manutenção, onde apenas eles podem logar.
-   **Diagnóstico de APIs:** Um painel para testar o status e a latência das APIs conectadas (DLP, Vertex AI, Gemini) em tempo real.
