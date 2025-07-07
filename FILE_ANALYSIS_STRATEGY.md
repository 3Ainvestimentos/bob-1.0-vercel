# Estratégia de Análise de Arquivos com o Sistema RAG

## Objetivo

Este documento descreve a estratégia técnica para implementar uma funcionalidade avançada no assistente: permitir que os usuários insiram arquivos (como planilhas de posição consolidada, PDFs, etc.) e recebam análises que cruzam as informações do arquivo com o conhecimento existente na base de dados interna (RAG via Vertex AI Search).

O caso de uso principal é:
> Um usuário anexa sua planilha de "posição consolidada" e pergunta: "Com base nas recomendações da 3A RIVA, quais ajustes eu deveria fazer na minha carteira?". O assistente deve usar o conteúdo da planilha e o conhecimento do RAG sobre recomendações de ativos para fornecer uma análise contextualizada.

A seguir, apresentamos a abordagem recomendada para implementar esta funcionalidade.

---

## Abordagem Recomendada: Enriquecimento de Prompt

Esta é a abordagem mais direta, robusta e eficiente, pois aproveita a infraestrutura RAG existente, apenas "enriquecendo" a informação que é enviada para ela.

O fluxo é dividido em três etapas principais:

### 1. Interface do Usuário e Pré-processamento

-   **Seleção de Arquivo:** O usuário utiliza o botão de anexo (`<Paperclip />`) para selecionar um arquivo local (PDF, Word, Excel, etc.).
-   **Conversão para Texto:** No backend, a primeira e mais crucial etapa é converter o conteúdo binário do arquivo em texto puro. Bibliotecas específicas para cada tipo de arquivo serão necessárias (ex: `pdf-parse` para PDFs, `mammoth` para `.docx`, `xlsx` para planilhas). O resultado final é uma única variável de texto contendo os dados do arquivo do usuário.

### 2. Lógica de Geração: A Construção do Prompt Combinado

Esta é a parte central da lógica. Em vez de enviar apenas a pergunta do usuário para a função `callDiscoveryEngine`, o sistema montará um **novo prompt combinado e detalhado** dentro do parâmetro `query`.

Este prompt instrui o modelo de linguagem sobre como utilizar as informações fornecidas. A estrutura do prompt combinado seria:

```plaintext
[Instruções e Pergunta do Usuário]

[Contexto Adicional do Arquivo do Usuário]

[Instrução Final para a IA]
```

**Exemplo Prático do `query` a ser enviado:**

```
Usuário fez a seguinte pergunta: "Com base nas recomendações da 3A RIVA, quais ajustes eu deveria fazer na minha carteira?"

Para responder, considere o portfólio do usuário, que está descrito abaixo:
--- INÍCIO DO ARQUIVO DO USUÁRIO ---
[Aqui entraria o texto extraído da planilha:
- Ação XYZ, Quantidade: 1000, Valor: R$ 50.000
- Debênture ABC, Quantidade: 50, Valor: R$ 52.000
...]
--- FIM DO ARQUIVO DO USUÁRIO ---

Agora, utilize o seu conhecimento interno (os documentos do RAG) sobre as recomendações de debêntures e outros ativos para analisar o portfólio acima e responder à pergunta do usuário de forma detalhada e comparativa.
```

### 3. Execução e Resposta

-   O `query` gigante e enriquecido é enviado para o endpoint do Vertex AI Search através da função `callDiscoveryEngine`.
-   O sistema RAG utilizará as palavras-chave tanto da pergunta quanto do conteúdo do arquivo para encontrar os documentos mais relevantes na base de conhecimento.
-   O modelo de linguagem final (que gera o resumo) receberá o prompt enriquecido e os documentos do RAG, tendo todo o contexto necessário para gerar a análise comparativa solicitada.

---

## Abordagem Alternativa: Análise em Duas Etapas (Avançado)

Uma alternativa mais complexa seria tratar a busca no RAG como uma "ferramenta" que a IA pode invocar.

1.  A IA recebe a pergunta e o texto do arquivo.
2.  Ela entende que precisa de informações internas e chama uma ferramenta que nós definimos, como `buscarRecomendacoesInternas(topico: "debentures")`.
3.  Nosso código executa essa função (que por baixo dos panos chama o `callDiscoveryEngine`) e retorna os resultados para a IA.
4.  Com ambas as informações em mãos (arquivo do usuário + dados do RAG), a IA formula a resposta final.

**Conclusão:** Embora poderosa, esta abordagem adiciona complexidade desnecessária para o caso de uso atual. A abordagem de **Enriquecimento de Prompt** é mais simples de implementar, mais controlável e atinge o objetivo desejado de forma eficaz.
