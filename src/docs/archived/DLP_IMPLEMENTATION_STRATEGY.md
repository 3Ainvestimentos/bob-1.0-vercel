# Estratégia de Implementação da API de DLP (Arquivado)

## 1. Contexto e Decisão

Para funcionalidades simples de chat, a anonimização via expressões regulares (regex) no servidor é uma solução de baixo custo. No entanto, para o cenário avançado de **análise de múltiplos arquivos com dados sensíveis**, onde o contexto entre diferentes entidades (clientes, por exemplo) deve ser preservado, essa abordagem se torna inadequada.

A estratégia de regex falha em dois pontos críticos neste cenário:
1.  **Inexatidão:** Não consegue identificar PII (Informações de Identificação Pessoal) não estruturadas, como nomes e endereços.
2.  **Perda de Contexto:** Ao substituir todos os nomes por um placeholder genérico como `[NOME_REMOVIDO]`, a IA se torna incapaz de diferenciar entre as entidades nos documentos, inviabilizando a análise.

Por esses motivos, a abordagem escolhida para funcionalidades avançadas é a integração com a **API Cloud Data Loss Prevention (DLP) do Google Cloud**.

---

## 2. Abordagem Técnica com a API de DLP

A solução utiliza a funcionalidade de **desidentificação com preservação de contexto** da API de DLP.

### 2.1. Vantagens da API de DLP
-   **Detecção Contextual:** Usa Machine Learning para identificar PII de forma muito mais precisa que regex.
-   **Tokenização Consistente (Surrogates):** Substitui um dado sensível por um token consistente. Ex: "João da Silva" sempre se tornará `[PERSON_NAME_1]` e "Maria Oliveira" sempre se tornará `[PERSON_NAME_2]`, permitindo que a IA preserve o contexto.
-   **Conformidade:** Utiliza uma ferramenta certificada pela Google, facilitando auditorias de segurança.

### 2.2. Fluxo de Execução Seguro

O fluxo foi desenhado para garantir que dados sensíveis originais nunca sejam armazenados (persistidos) no sistema.

1.  **Entrada do Usuário:** O usuário envia uma consulta, que pode conter PII.
2.  **Recepção no Backend:** A função `askAssistant` em `src/app/actions.ts` recebe a consulta original.
3.  **Processo de Anonimização:**
    -   A função `deidentifyQuery` é chamada, passando a consulta para a API de DLP do Google Cloud.
    -   A API de DLP retorna duas informações cruciais:
        -   A **string anonimizada** (ex: "A carteira de `[PERSON_NAME_1]`...").
        -   Os **"findings"**, que são os tipos de PII encontrados (ex: `PERSON_NAME`, `CPF_NUMBER`).
4.  **Consulta Segura à IA:** Apenas a **string anonimizada** é enviada para o `callDiscoveryEngine` ou `callGemini`. A IA nunca tem acesso ao dado original.
5.  **Registro e Armazenamento (Etapa Crítica de Segurança):**
    -   **Logs de Alerta:** A função `logDlpAlert` deve ser chamada APENAS com os **findings** (os tipos de PII), o `userId` e o `chatId`. O `originalQuery` **NUNCA** deve ser armazenado nos logs de alerta.
    -   **Histórico da Conversa:** A função `askAssistant` deve retornar a **versão anonimizada** da consulta para o frontend (`src/app/chat/page.tsx`). Ao salvar a conversa no Firestore com `saveConversation`, é esta versão anonimizada que deve ser persistida.

**Conclusão da Estratégia de Armazenamento:**
Ao seguir este fluxo, o dado sensível original é "usado e descartado" na memória do servidor durante a transação, mas **nunca é escrito em disco**, seja no banco de dados do histórico, seja nos logs de auditoria. Esta é a abordagem mais segura e em conformidade com as melhores práticas de privacidade de dados.
