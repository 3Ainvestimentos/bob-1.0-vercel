'use server';

import { GoogleAuth } from 'google-auth-library';

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


export async function askAssistant(query: string): Promise<string> {
  const serviceAccountKeyJson = process.env.SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKeyJson) {
    throw new Error('A variável de ambiente SERVICE_ACCOUNT_KEY não está definida no arquivo .env.');
  }

  let serviceAccountCredentials;
  try {
    serviceAccountCredentials = JSON.parse(serviceAccountKeyJson);
    // Correção para o erro "DECODER routines::unsupported"
    // Chaves privadas em JSON dentro de variáveis de ambiente podem ter seus newlines escapados (como \\n).
    // O google-auth-library espera newlines reais (\n). Esta linha corrige isso.
    if (serviceAccountCredentials.private_key) {
      serviceAccountCredentials.private_key = serviceAccountCredentials.private_key.replace(/\\n/g, '\n');
    }
  } catch (e: any) {
    console.error("Falha ao analisar SERVICE_ACCOUNT_KEY. Verifique o formato do JSON no seu arquivo .env. Erro:", e.message);
    throw new Error(`Falha ao analisar a chave da conta de serviço. Verifique o formato do JSON no seu arquivo .env. Detalhe: ${e.message}`);
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
      throw new Error('Falha ao obter o token de acesso usando a conta de serviço fornecida.');
    }

    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
             }
           }
        },
        userPseudoId: 'unique-user-id-for-testing',
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("API Error Response:", errorText);
      throw new Error(`A API retornou um erro: ${apiResponse.status}. Resposta: ${errorText}`);
    }

    const data = await apiResponse.json();
    const summary = data.summary?.summaryText || "Não foi possível gerar um resumo.";

    return summary;

  } catch (error: any) {
    console.error("Error in askAssistant:", error.message);
    if (error.message.includes('Could not refresh access token') || error.message.includes('permission')) {
       throw new Error('Erro de permissão. Verifique no IAM se a conta de serviço fornecida no arquivo .env tem o papel "Usuário do Discovery Engine".');
    }
    throw new Error(`Ocorreu um erro ao se comunicar com o assistente: ${error.message}`);
  }
}
