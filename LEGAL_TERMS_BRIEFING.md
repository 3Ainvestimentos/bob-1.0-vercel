# Briefing para Elaboração dos Termos de Uso e Política de Privacidade

**Para:** Departamento Jurídico / Advogada(o) Responsável
**De:** Equipe de Desenvolvimento - Assistente Corporativo Bob
**Assunto:** Coleta de subsídios técnicos para a criação dos documentos legais da aplicação.

---

## 1. Visão Geral da Aplicação

-   **Nome:** Assistente Corporativo Bob
-   **Propósito:** É uma ferramenta de produtividade interna, um "assistente de IA" exclusivo para os colaboradores da 3A RIVA e 3A Investimentos. Seu objetivo é otimizar tarefas, respondendo perguntas com base em uma base de conhecimento interna (documentos da empresa) e, quando o usuário solicita, informações da internet.
-   **Público-Alvo:** Exclusivamente colaboradores com e-mails corporativos (`@3ariva.com.br` e `@3ainvestimentos.com.br`).

## 2. Coleta e Tratamento de Dados

Para a elaboração dos termos, é crucial entender como os dados dos usuários e de seus clientes são tratados.

#### 2.1. Autenticação e Acesso
-   O acesso à plataforma é controlado. O login só é permitido através de uma conta Google e é restrito a usuários com os domínios de e-mail autorizados. Não é possível acessar com e-mails pessoais (ex: `@gmail.com`).

#### 2.2. Dados Armazenados
-   **Conversas:** O histórico de perguntas e respostas de cada usuário é salvo em nosso banco de dados (Google Firestore) para que ele possa acessá-lo posteriormente.
-   **Arquivos:** O usuário pode anexar arquivos para análise. O conteúdo desses arquivos é processado, mas **não é armazenado permanentemente**. Ele é usado apenas para gerar a resposta e depois descartado.
-   **Feedbacks:** Os usuários podem avaliar as respostas da IA (positiva ou negativamente) e deixar comentários. Esses feedbacks são armazenados.

## 3. A Medida de Segurança Mais Importante: Anonimização Automática

Este é o ponto central da nossa estratégia de privacidade e segurança.

-   **O que é?** Antes que qualquer pergunta do usuário ou conteúdo de um arquivo seja enviado para a Inteligência Artificial, ele passa por um filtro automático (a API **Google Cloud Data Loss Prevention - DLP**).
-   **Finalidade:** Este filtro **detecta e remove Informações de Identificação Pessoal (PII)**, como nomes de pessoas, CPFs, números de telefone, etc.
-   **Exemplo Prático:**
    -   O usuário digita: `Qual o saldo do cliente João da Silva, CPF 123.456.789-00?`
    -   O sistema, antes de processar, transforma a pergunta em: `Qual o saldo do cliente [PERSON_NAME], CPF [BRAZIL_CPF_NUMBER]?`
-   **Resultado:**
    1.  A **Inteligência Artificial nunca tem acesso aos dados originais** de clientes ou a outras informações sensíveis.
    2.  O histórico de conversas que salvamos no banco de dados é **armazenado em seu formato já anonimizado**.
-   **Logs de Alerta:** Se o sistema detecta PII, ele gera um alerta interno para a equipe de segurança, mas este alerta contém apenas o *tipo* de dado encontrado (ex: `PERSON_NAME`), e **não o dado original**.

> **Para os Termos:** É fundamental deixar claro para o usuário que, embora tenhamos essa camada de proteção robusta, ele **não deve inserir dados sensíveis desnecessários** na plataforma, como uma boa prática de segurança.

## 4. Uso da Inteligência Artificial (IA)

-   **Fontes de Resposta:** A IA é instruída a priorizar respostas com base em:
    1.  **Arquivos anexados pelo usuário:** Se um arquivo é enviado, a IA foca em seu conteúdo.
    2.  **Base de Conhecimento Interna (RAG):** Documentos e informações previamente autorizadas pela 3A RIVA.
    3.  **Busca na Web (Opcional):** Apenas se as fontes internas não forem suficientes E o usuário clicar ativamente no botão "Pesquisar na Web", a IA buscará informações externas.
-   **Limitação de Responsabilidade:** As respostas da IA são para **suporte à decisão**, mas podem conter erros ou imprecisões. Elas **não constituem aconselhamento financeiro, recomendação de investimento ou orientação jurídica formal**. É responsabilidade do colaborador verificar a precisão e a aplicabilidade das informações antes de tomar qualquer ação, especialmente em comunicações com clientes.

## 5. Direitos e Controle do Usuário

-   **Gerenciamento do Histórico:** O usuário pode visualizar todo o seu histórico de conversas, organizá-las em pastas (projetos) e excluí-las a qualquer momento.
-   **Exclusão de Dados:** A exclusão de uma conversa a remove de nossos sistemas principais.

## 6. Pontos a serem Abordados nos Documentos Legais (Sugestão)

1.  **Termos de Uso:**
    -   Definir o escopo da ferramenta como de uso interno e profissional.
    -   Esclarecer a restrição de acesso por domínio.
    -   Incluir a cláusula de limitação de responsabilidade sobre as respostas da IA.
    -   Descrever a responsabilidade do usuário em não inserir dados sensíveis de forma inadequada.
2.  **Política de Privacidade:**
    -   Detalhar quais dados são coletados (conversas, feedbacks).
    -   Explicar de forma clara e transparente o processo de **anonimização automática (DLP)** como principal medida de proteção de dados.
    -   Informar sobre o armazenamento dos dados (Google Firestore) e os direitos do usuário (acesso, exclusão).
    -   Explicar a finalidade do tratamento dos dados (fornecer o serviço, melhorar a ferramenta).
