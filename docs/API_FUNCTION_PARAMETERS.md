# Documentação de Parâmetros: `callDiscoveryEngine` e `callGemini`

Este documento detalha os parâmetros e as opções disponíveis para as duas principais funções de interação com os modelos de IA no arquivo `src/app/actions.ts`.

---

## 1. `callDiscoveryEngine` (Busca RAG)

Esta função é responsável por fazer consultas à base de conhecimento interna da empresa (RAG - Retrieval-Augmented Generation) através do Google Vertex AI Search.

### Assinatura da Função:

```typescript
async function callDiscoveryEngine(
    query: string,
    attachments: AttachedFile[],
    preamble: string = ASSISTENTE_CORPORATIVO_PREAMBLE
): Promise<{ 
    summary: string; 
    searchFailed: boolean; 
    sources: ClientRagSource[];
    promptTokenCount?: number; 
    candidatesTokenCount?: number; 
}>
```

### Parâmetros de Entrada:

| Parâmetro     | Tipo              | Obrigatório | Descrição                                                                                                                              |
| :------------ | :---------------- | :---------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| `query`       | `string`          | **Sim**     | A pergunta ou comando do usuário que será enviado ao motor de busca.                                                                   |
| `attachments` | `AttachedFile[]`  | **Sim**     | Um array de objetos `AttachedFile`, onde cada objeto contém o conteúdo textual de um arquivo anexado para ser usado como contexto na busca. |
| `preamble`    | `string`          | Não         | A "instrução de sistema" ou prompt que guia o comportamento da IA. Por padrão, utiliza o `ASSISTENTE_CORPORATIVO_PREAMBLE`. Para análises de relatório, este valor é substituído pelo `POSICAO_CONSOLIDADA_PREAMBLE`. |

### Exemplo de Uso Interno:
```typescript
// Chamada padrão
result = await callDiscoveryEngine(
    "Qual o procedimento para solicitar férias?",
    [], // Sem arquivos anexados
    ASSISTENTE_CORPORATIVO_PREAMBLE
);

// Chamada para análise de relatório
result = await callDiscoveryEngine(
    "faça a análise deste relatório",
    [{...fileData}],
    POSICAO_CONSOLIDADA_PREAMBLE
);
```
---

## 2. `callGemini` (Busca Web e Geração Geral)

Esta função interage diretamente com a API do Google Gemini. É usada para busca na web, geração de títulos, sugestões de perguntas e outras tarefas que não dependem da base de conhecimento interna.

### Assinatura da Função:

```typescript
async function callGemini(
    query: string,
    attachments: AttachedFile[] = [],
    preamble: string | null = null,
    enableWebSearch: boolean = false,
    jsonOutput: boolean = false
): Promise<{ 
    summary: string; 
    searchFailed: boolean; 
    sources: ClientRagSource[];
    promptTokenCount?: number; 
    candidatesTokenCount?: number; 
}>
```

### Parâmetros de Entrada:

| Parâmetro           | Tipo              | Obrigatório | Descrição                                                                                                                                                                                             |
| :------------------ | :---------------- | :---------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`             | `string`          | **Sim**     | A pergunta do usuário ou o texto base para a geração.                                                                                                                                                 |
| `attachments`       | `AttachedFile[]`  | Não         | Um array de objetos `AttachedFile` para fornecer contexto de arquivos. O padrão é um array vazio (`[]`).                                                                                                |
| `preamble`          | `string | null`   | Não         | Uma instrução de sistema para guiar o modelo. Usado, por exemplo, na extração de dados de relatórios (`XP_REPORT_EXTRACTION_PREAMBLE`). O padrão é `null`.                                             |
| `enableWebSearch`   | `boolean`         | Não         | Se `true`, habilita a ferramenta de busca do Google no Gemini, permitindo que a IA busque informações na web para responder. O padrão é `false`.                                                       |
| `jsonOutput`        | `boolean`         | Não         | Se `true`, instrui o modelo Gemini a formatar sua resposta como um objeto JSON válido. Essencial para extração de dados estruturados. O padrão é `false`.                                                |

### Exemplo de Uso Interno:
```typescript
// Chamada para busca na web
result = await callGemini(
    "Qual a cotação atual do dólar?",
    [],
    null,
    true // Habilita a busca na web
);

// Chamada para extração de dados estruturados de um relatório
result = await callGemini(
    textContent, // Conteúdo do arquivo
    [],
    XP_REPORT_EXTRACTION_PREAMBLE,
    false,
    true // Pede a resposta em JSON
);
```