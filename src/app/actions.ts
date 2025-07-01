'use server';

import { GoogleAuth } from 'google-auth-library';

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
                preamble: "Você é um assistente especialista e factual. Responda a pergunta do usuário baseando-se estritamente e exclusivamente nas informações encontradas nos trechos de contexto fornecidos. Se a resposta não estiver contida no contexto, afirme claramente que você não encontrou a informação nos documentos disponíveis. Não utilize nenhum conhecimento externo."
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
