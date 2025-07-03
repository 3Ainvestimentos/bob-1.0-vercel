
'use server';

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';

const ASSISTENTE_CORPORATIVO_PREAMBLE = `## [1. IDENTIDADE E PROPÓSITO]
Você é o "Assistente Corporativo 3A RIVA", a inteligência artificial de suporte e aceleração de negócios do nosso grupo. Seu nome, Bob, é um acrônimo para 'Bot on Beta', escolhido pela área de Estratégia e IA da 3A RIVA para reforçar nosso compromisso com a melhoria contínua e o aprendizado constante. Seu propósito é ser um parceiro estratégico para **todos os colaboradores**, do estagiário ao CEO. Você deve ser capaz de entender e atender a diferentes tipos de necessidade:
- **Analítica:** Fornecendo dados, métricas e cruzando informações.
- **Comercial:** Apoiando na estruturação de propostas e na busca por materiais de produtos.
- **Reflexiva:** Ajudando a estruturar o pensamento estratégico e explorar cenários.
- **Pesquisa:** Buscando informações de mercado, tendências e notícias relevantes.
- **Automação:** Orientando sobre o uso de ferramentas como n8n, Looker Studio e CRM.
- **Criação de Conteúdo:** Auxiliando na redação de comunicações, pautas e relatórios.

## [2. CONTEXTO CORPORATIVO E AUDIÊNCIA]
Nosso grupo é composto por uma Assessoria de Investimentos e um Multi-Family Office (MFO). Seu público é toda a empresa, incluindo analistas, assessores, gestores e a diretoria. Adapte a profundidade e o tom da sua resposta ao provável nível de senioridade e à área de atuação do seu interlocutor, sempre mantendo um padrão de excelência e profissionalismo.

## [3. PRINCÍPIOS FUNDAMENTAIS DE ATUAÇÃO (REGRAS INEGOCIÁVEIS)]

1.  **Segurança e Confidencialidade Absoluta (Diretriz Principal):**
    * **NUNCA** processe, armazene ou solicite dados pessoais identificáveis (PII) de clientes. Isso inclui, mas não se limita a: CPFs, contas bancárias ou extratos nominais. A conformidade com a LGPD é sua prioridade máxima.
    * Ao identificar um prompt com dados sensíveis, recuse a tarefa e oriente o colaborador a reformular a pergunta com dados anonimizados.

2.  **Princípio do Acesso Gerenciado (RBAC):**
    * As informações **internas** que você acessa para responder a uma consulta já foram pré-filtradas por um administrador de sistema de acordo com o nível de acesso do colaborador logado.
    * Responda **ESTRITAMENTE** com base nas informações internas que lhe são fornecidas para cada consulta.
    * Se um tema não estiver em seu contexto para aquela pergunta, **NÃO** tente inferir ou buscar a informação em outro lugar. Informe que o dado não está disponível no nível de acesso atual e sugira que o usuário consulte seu gestor ou o comitê apropriado.

3.  **Fontes de Conhecimento Híbridas e Citação Obrigatória:**
    * Você pode usar duas fontes de conhecimento: a **Base de Dados Interna** e o seu **Conhecimento Externo (Internet)**.
    * É **OBRIGATÓRIO** sinalizar a fonte de sua resposta.
        * Para dados internos: Use "Segundo nossos registros internos...", "Conforme a ata do Comitê X...".
        * Para dados externos ou resultados de busca na web: Use "Com base em informações públicas de mercado...", "De acordo com fontes abertas na internet...", ou "Após uma busca na web, encontrei o seguinte:". Se citar um link específico, inclua-o.
    * A base de dados interna é a fonte primária para qualquer assunto sobre a empresa, seus processos, clientes e métricas. O conhecimento externo deve ser usado para pesquisa de mercado, tendências, inspiração criativa e informações gerais que não competem com dados internos.

4.  **Formatação de Links Obrigatória:**
    * Quando sua resposta se referir a um documento, fonte ou página da web que foi encontrada na base de dados e possui um URL, você **DEVE** formatar a citação como um hyperlink em Markdown.
    * **Exemplo:** "Você pode encontrar mais detalhes no [Guia de Boas-Vindas](https://www.example.com/onboarding)."
    * Isso torna a informação diretamente acionável para o colaborador.

## [4. TOM DE VOZ E ESTILO DE COMUNICAÇÃO]
* **Profissional e Adaptativo:** Seja objetivo e claro, mas ajuste a complexidade da linguagem ao público.
* **Estruturado:** Sempre que possível, organize as respostas em bullet points, checklists ou tabelas para máxima clareza.

## [5. DIRETRIZES DE INTERAÇÃO COM COLABORADORES]
* **Se a demanda for analítica:** Priorize dados da base interna, direcione para os dashboards no Looker Studio e apresente os números de forma estruturada.
* **Se a demanda for de pesquisa ou exigir informações recentes:** Use a ferramenta 'performWebSearch' para buscar informações na internet. Resuma as informações encontradas e cite as fontes (links) para que o colaborador possa se aprofundar.
* **Se a demanda for de criação de conteúdo:** Peça o objetivo, o público-alvo e o tom desejado. Use o conhecimento externo (incluindo a ferramenta de busca se necessário) para inspiração e os dados internos para embasar a mensagem.
* **Se a demanda for de automação:** Explique como nossas ferramentas (n8n, CRM, etc.) podem ser usadas para resolver o problema e descreva um possível fluxo de trabalho.

## [6. ESCOPO E LIMITAÇÕES]
* Você é uma ferramenta de suporte à decisão, não o decisor final.
* Você não fornece aconselhamento financeiro ou recomendações de investimento para clientes finais.
* Você não emite opiniões pessoais. Sua função é apresentar os fatos e dados de forma organizada e útil.

## [7. USO DE FERRAMENTAS]
* **Busca na Web ('performWebSearch'):** Se a pergunta do usuário solicitar informações muito recentes (eventos atuais, notícias de última hora), dados específicos que provavelmente não estão em seu conhecimento de treinamento (por exemplo, "qual o preço atual da ação X?", "qual a previsão do tempo para amanhã em Y?"), ou se você julgar que uma busca na web enriqueceria a resposta, utilize a ferramenta 'performWebSearch'. Formule uma consulta de busca clara e concisa para a ferramenta. Após receber os resultados, resuma-os e cite as fontes (links) fornecidas pela ferramenta.`;


async function callDiscoveryEngine(query: string, userId?: string | null): Promise<{ summary: string; searchFailed: boolean }> {
    const serviceAccountKeyJson = process.env.SERVICE_ACCOUNT_KEY_INTERNAL;
    if (!serviceAccountKeyJson) {
      throw new Error(`A variável de ambiente necessária (SERVICE_ACCOUNT_KEY_INTERNAL) não está definida no arquivo .env.`);
    }

    let serviceAccountCredentials;
    try {
      serviceAccountCredentials = JSON.parse(serviceAccountKeyJson);
      if (serviceAccountCredentials.private_key) {
        serviceAccountCredentials.private_key = serviceAccountCredentials.private_key.replace(/\\n/g, '\n');
      }
    } catch (e: any) {
      console.error(`Falha ao analisar SERVICE_ACCOUNT_KEY_INTERNAL. Verifique o formato do JSON no seu arquivo .env. Erro:`, e.message);
      throw new Error(`Falha ao analisar a chave da conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL). Verifique se a variável de ambiente está definida e se o valor é um JSON válido e formatado corretamente em uma única linha no arquivo .env.`);
    }

    const projectId = serviceAccountCredentials.project_id;
    const location = 'global';
    const engineId = 'datavisorvscoderagtest_1751310702302';
    const collectionId = 'default_collection';
    const servingConfigId = 'default_search';

    const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/servingConfigs/${servingConfigId}:search`;
    
    const auth = new GoogleAuth({
      credentials: serviceAccountCredentials,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    try {
      const client = await auth.getClient();
      const accessTokenResponse = await client.getAccessToken();
      const accessToken = accessTokenResponse.token;

      if (!accessToken) {
        throw new Error(`Falha ao obter o token de acesso usando a conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL).`);
      }

      const requestBody: any = {
        query: query,
        pageSize: 5,
        queryExpansionSpec: { condition: 'AUTO' },
        spellCorrectionSpec: { mode: 'AUTO' },
        languageCode: 'pt-BR',
        contentSearchSpec: {
            summarySpec: {
              summaryResultCount: 5,
              ignoreAdversarialQuery: true,
              useSemanticChunks: true,
              modelPromptSpec: {
                preamble: ASSISTENTE_CORPORATIVO_PREAMBLE
              },
              temperature: 0.2
            }
        },
        userPseudoId: userId || 'anonymous-user',
      };

      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error("API Error Response:", errorText);
        throw new Error(`A API retornou um erro: ${apiResponse.status}. Resposta: ${errorText}`);
      }

      const data = await apiResponse.json();
      
      if (!data.results || data.results.length === 0) {
          return { 
              summary: "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?", 
              searchFailed: true 
          };
      }

      const summary = data.summary?.summaryText || "Não foi possível gerar um resumo.";

      const internalSearchFailureKeywords = [
          "não encontrei a informação",
          "não foi possível encontrar",
          "informações públicas de mercado",
          "busca na web",
          "nenhum resultado encontrado",
          "não foi possível gerar um resumo",
          "no results could be found"
      ];
      
      const searchFailed = internalSearchFailureKeywords.some(keyword => 
        summary.toLowerCase().includes(keyword)
      );

      if (searchFailed) {
        return { 
          summary: "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?", 
          searchFailed: true 
        };
      }

      return { summary, searchFailed: false };

    } catch (error: any) {
      console.error("Error in callDiscoveryEngine:", error.message);
      if (error.message.includes('Could not refresh access token') || error.message.includes('permission')) {
         throw new Error(`Erro de permissão. Verifique no IAM se a conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL) tem o papel "Usuário do Discovery Engine".`);
      }
      throw new Error(`Ocorreu um erro ao se comunicar com o Discovery Engine: ${error.message}`);
    }
}


async function callGemini(query: string): Promise<{ summary: string; searchFailed: boolean }> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("A variável de ambiente GEMINI_API_KEY não está definida. Por favor, adicione-a ao seu arquivo .env.");
  }
  
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        temperature: 0.2
      } 
    });
    
    const prompt = `Você é um assistente de pesquisa prestativo. Responda à seguinte pergunta do usuário da forma mais completa e precisa possível com base em seu conhecimento geral.

Pergunta: "${query}"`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return { summary: text, searchFailed: false };

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    if (error.message.includes('API key not valid')) {
      throw new Error(`A chave da API do Gemini (GEMINI_API_KEY) parece ser inválida. Verifique a chave no seu arquivo .env e no Google AI Studio.`);
    }
    throw new Error(`Ocorreu um erro ao se comunicar com o Gemini: ${error.message}`);
  }
}


export async function askAssistant(
  query: string,
  options: { useWebSearch?: boolean } = {},
  userId?: string | null
): Promise<{ summary: string; searchFailed: boolean }> {
  const { useWebSearch = false } = options;

  try {
    if (useWebSearch) {
      return await callGemini(query);
    } else {
      return await callDiscoveryEngine(query, userId);
    }
  } catch (error: any) {
    console.error("Error in askAssistant:", error.message);
    // Re-throw a user-friendly error
    throw new Error(`Ocorreu um erro ao se comunicar com o assistente: ${error.message}`);
  }
}

export async function generateSuggestedQuestions(
  query: string,
  answer: string
): Promise<string[]> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("A variável de ambiente GEMINI_API_KEY não está definida. Não é possível gerar sugestões.");
    return [];
  }

  const prompt = `Baseado na pergunta do usuário e na resposta do assistente, gere 3 perguntas de acompanhamento curtas e relevantes que o usuário poderia fazer a seguir. Retorne APENAS um array JSON de strings, sem nenhum outro texto ou formatação. As perguntas devem ser concisas e em português.

  Pergunta do Usuário: "${query}"
  Resposta do Assistente: "${answer}"`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const suggestions = JSON.parse(response.text());

    if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string')) {
      return suggestions;
    }

    console.warn("A resposta da IA para sugestões não era um array de strings:", suggestions);
    return [];
  } catch (error: any) {
    console.error("Erro ao gerar sugestões:", error.message);
    return []; 
  }
}
