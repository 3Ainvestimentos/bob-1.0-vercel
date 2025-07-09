# Estratégia de Implementação de DLP (Prevenção de Perda de Dados)

## 1. Objetivo

Implementar um sistema de Prevenção de Perda de Dados (DLP) robusto para proteger informações sensíveis, como PII (Informações de Identificação Pessoal), impedindo que sejam processadas pela IA e registrando tentativas para fins de auditoria de segurança.

A estratégia é baseada em uma abordagem de **defesa em profundidade de duas camadas**:
1.  **Validação no Lado do Cliente:** Feedback em tempo real para o usuário, prevenindo o envio de dados.
2.  **Verificação e Log no Lado do Servidor:** Uma rede de segurança para auditoria e como barreira final.

---

## 2. Camada 1: Validação no Lado do Cliente

Esta é a primeira e mais importante linha de defesa. O objetivo é impedir que dados sensíveis saiam do navegador do usuário.

### 2.1. Fluxo de Funcionamento

1.  O usuário digita na caixa de texto do chat.
2.  A cada alteração no texto, uma função em JavaScript executa uma verificação usando uma lista de expressões regulares (regex) para identificar padrões de PII (CPF, e-mail, telefone, etc.).
3.  **Se um padrão é encontrado:**
    *   Uma mensagem de alerta discreta é exibida abaixo da caixa de texto (ex: "Dados sensíveis detectados. Remova-os para enviar.").
    *   O botão de envio é desabilitado (`disabled`).
4.  **Se nenhum padrão é encontrado (ou após o usuário corrigir o texto):**
    *   A mensagem de alerta desaparece.
    *   O botão de envio é reabilitado.

### 2.2. Plano de Implementação Técnica

-   **Novo Arquivo (`src/lib/dlp-patterns.ts`):**
    -   Criar um arquivo para exportar um array de objetos, onde cada objeto contém o nome do padrão e sua respectiva regex.
    ```javascript
    export const piiPatterns = [
        { name: 'CPF', regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
        { name: 'Email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
        // ... outros padrões
    ];
    ```

-   **Modificação em `src/components/chat/ChatInputForm.tsx`:**
    -   Importar `piiPatterns`.
    -   Adicionar um estado para gerenciar o alerta: `const [dlpWarning, setDlpWarning] = useState<string | null>(null);`
    -   Usar um hook `useEffect` que observa o estado `input`.
    -   Dentro do `useEffect`, iterar sobre os `piiPatterns`. Se algum padrão corresponder ao texto, atualizar o estado `setDlpWarning` com uma mensagem apropriada. Caso contrário, defini-lo como `null`.
    -   No JSX, renderizar a mensagem de alerta condicionalmente.
    -   Adicionar a propriedade `disabled` ao botão de envio, baseando-se em `isLoading || !input.trim() || !!dlpWarning`.

---

## 3. Camada 2: Verificação e Log no Lado do Servidor

Esta camada funciona como uma rede de segurança e um sistema de auditoria, caso a validação do cliente seja contornada.

### 3.1. Fluxo de Funcionamento

1.  O usuário envia uma mensagem (o `query`).
2.  A função `askAssistant` no servidor recebe o `query`.
3.  **Antes** de enviar o `query` para a API de IA, uma função de verificação interna é chamada.
4.  Esta função usa os mesmos `piiPatterns` para verificar o `query`.
5.  **Se um padrão é encontrado:**
    -   A função `logDlpAlert` (já existente) é chamada, registrando os detalhes da tentativa no Firestore na coleção `dlp_alerts`.
    -   A execução continua normalmente. O `query` ainda é enviado para a IA.
6.  O `preamble` de segurança da IA (que já proíbe o processamento de PII) atua como a barreira final, garantindo que o modelo se recuse a processar a solicitação.

### 3.2. Plano de Implementação Técnica

-   **Modificação em `src/app/actions.ts`:**
    -   Importar `piiPatterns` do `src/lib/dlp-patterns.ts` (ou duplicar as regex, se preferir manter o backend sem dependências diretas do `lib`).
    -   Criar uma função auxiliar assíncrona dentro do arquivo, como `async function detectAndLogDlp(query: string, userId: string, chatId: string)`.
    -   Esta função irá:
        -   Testar o `query` contra as regex.
        -   Se encontrar correspondências, formatará os "findings" e chamará `logDlpAlert`.
    -   Dentro da função `askAssistant`, chamar esta nova função: `await detectAndLogDlp(query, userId, activeChatId);` (será necessário passar o `chatId` para `askAssistant`).

## 4. Benefícios da Abordagem

-   **Segurança em Camadas:** Não depende de uma única linha de defesa.
-   **Experiência do Usuário:** O feedback imediato no cliente é mais amigável do que uma simples recusa do servidor.
-   **Auditoria:** Fornece um rastro claro para a equipe de segurança sobre tentativas de vazamento de dados.
-   **Eficiência:** Evita o custo e a latência de chamar uma API de DLP externa para cada mensagem.
-   **Resiliência:** Mesmo que a validação do cliente falhe ou seja contornada, o servidor e a IA ainda fornecem proteção.
