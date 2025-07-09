# Estratégia de Implementação de DLP (Prevenção de Perda de Dados) - Abordagem de Anonimização

## 1. Objetivo

Implementar um sistema de Prevenção de Perda de Dados (DLP) que permita aos usuários inserir informações sensíveis (PII), mas que garanta que esses dados sejam **anonimizados** antes de serem processados pela IA. O sistema também deve registrar as ocorrências para fins de auditoria de segurança, sem interromper o fluxo do usuário.

A estratégia é baseada em uma abordagem de **anonimização segura e transparente no lado do servidor**.

---

## 2. Estratégia Principal: Anonimização no Lado do Servidor

Esta é a abordagem mais segura e robusta. Toda a lógica de detecção e anonimização ocorre no backend, tornando-a invisível e impossível de ser contornada pelo cliente.

### 2.1. Fluxo de Funcionamento

1.  **Entrada do Usuário:** O usuário digita sua consulta na caixa de chat, que pode conter dados sensíveis (CPF, e-mail, telefone, etc.).
2.  **Envio Bruto:** O texto é enviado ao servidor exatamente como foi digitado.
3.  **Processamento no Backend (`askAssistant`):**
    a. A função `askAssistant` no servidor recebe a consulta original (`query`).
    b. **ANTES** de passar a consulta para a IA, ela é enviada para uma nova função auxiliar chamada `anonymizeQuery(query)`.
    c. A função `anonymizeQuery` usa uma lista de expressões regulares (`piiPatterns`) para encontrar e substituir cada dado sensível por um placeholder genérico (ex: `123.456.789-00` vira `[CPF_REMOVIDO]`).
    d. Ao mesmo tempo, a função identifica quais tipos de PII foram encontrados.
4.  **Log de Auditoria:**
    a. Se algum PII foi detectado, a função `logDlpAlert` (já existente) é chamada.
    b. O log armazena o `userId`, `chatId`, a `originalQuery` e os `findings` (os tipos de PII encontrados, como 'CPF' ou 'Email').
5.  **Envio para a IA:**
    a. Apenas a consulta **totalmente anonimizada** é enviada para o `callDiscoveryEngine`.
    b. **O dado sensível original NUNCA chega ao serviço de IA.**
6.  **Resposta ao Usuário:** A IA processa a consulta anonimizada e retorna a resposta. O usuário recebe a resposta e, como ele tem o contexto original, entende a que os placeholders se referem.

### 2.2. Plano de Implementação Técnica

-   **Novo Arquivo (`src/lib/dlp-patterns.ts`):**
    -   Criar um arquivo para exportar um array de objetos, onde cada objeto contém o nome do padrão, sua respectiva regex e o placeholder de substituição.
    ```javascript
    export const piiPatterns = [
        { name: 'CPF', regex: /\b\d{3}[.]?\d{3}[.]?\d{3}[-]?\d{2}\b/g, placeholder: '[CPF_REMOVIDO]' },
        { name: 'Email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, placeholder: '[EMAIL_REMOVIDO]' },
        { name: 'Telefone', regex: /\b\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/g, placeholder: '[TELEFONE_REMOVIDO]' },
        { name: 'RG', regex: /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\d|X|x]\b/g, placeholder: '[RG_REMOVIDO]' },
        { name: 'CNPJ', regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, placeholder: '[CNPJ_REMOVIDO]' },
        { name: 'Cartao de Credito', regex: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, placeholder: '[CARTAO_REMOVIDO]' },
    ];
    ```

-   **Modificação em `src/app/actions.ts`:**
    -   Importar `piiPatterns` de `src/lib/dlp-patterns.ts`.
    -   Criar uma função auxiliar `async function anonymizeAndLog(query: string, userId: string, chatId: string): Promise<string>`.
    -   Esta função irá:
        -   Iterar sobre `piiPatterns`.
        -   Manter um array `findings` com os nomes dos padrões encontrados.
        -   Usar `query.replace(pattern.regex, pattern.placeholder)` para criar a versão anonimizada.
        -   Se `findings` não estiver vazio, chamar `logDlpAlert`.
        -   Retornar a string da consulta anonimizada.
    -   Dentro da função `askAssistant`, modificar a chamada:
        -   Originalmente: `return await callDiscoveryEngine(query, userId);`
        -   Modificado:
            ```javascript
            // É necessário passar chatId para askAssistant
            const anonymizedQuery = await anonymizeAndLog(query, userId, activeChatId);
            return await callDiscoveryEngine(anonymizedQuery, userId);
            ```

## 3. Benefícios da Abordagem

-   **Segurança Máxima:** A lógica de DLP está no servidor, imune a manipulação no cliente. Os dados sensíveis nunca saem da nossa infraestrutura controlada.
-   **Excelente Experiência do Usuário:** O usuário não é interrompido por alertas ou bloqueios. A anonimização é transparente para ele.
-   **Auditoria Completa:** Mantemos um registro detalhado de todas as tentativas de uso de PII para fins de conformidade e segurança.
-   **Conformidade:** Impede o envio de PII para serviços de IA de terceiros, ajudando a cumprir regulações de privacidade como a LGPD.
-   **Simplicidade de Manutenção:** A lógica é centralizada em um único local (`actions.ts` e `dlp-patterns.ts`), facilitando futuras atualizações nos padrões de DLP.
