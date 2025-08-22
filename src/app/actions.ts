
'use server';

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuthenticatedFirestoreAdmin, getAuthenticatedAuthAdmin, getFirebaseAdminApp, getServiceAccountCredentialsFromEnv } from '@/lib/server/firebase';
import { AttachedFile, UserRole } from '@/types';
import { Message, RagSource as ClientRagSource } from '@/app/chat/page';
import { SpeechClient } from '@google-cloud/speech';
import { estimateTokens, getFileContent, formatTutorialToMarkdown } from '@/lib/server/utils';
import { POSICAO_CONSOLIDADA_PREAMBLE } from '@/app/chat/preambles';


const ASSISTENTE_CORPORATIVO_PREAMBLE = `Siga estas regras ESTRITAS:

1.  **CONTEXTO PRINCIPAL:** O termo "a empresa" refere-se SEMPRE à "3A RIVA". Todos os documentos fornecidos são sobre a 3A RIVA. Responda perguntas como "Quem é o CEO da empresa?" e "Quem é o CEO da 3A RIVA?" com a mesma informação baseada nos documentos.

2.  **IDENTIDADE:** Seu tom de voz é profissional, claro e estruturado. Use listas e tabelas. A resposta de saudação só deve ser utilizada caso o usuário solicite.

3.  **REGRA DE TRANSCRIÇÃO (CRÍTICA):**
    - **SAUDAÇÃO:** Se a pergunta for uma saudação (Olá, Bom dia, etc.), procure o documento "RESPOSTA_SAUDACAO" e transcreva seu conteúdo.
    - **TUTORIAIS:** Se a busca encontrar documentos com "tutorial" no nome, sua resposta DEVE ser uma transcrição EXATA e literal do conteúdo de TODOS os arquivos encontrados. NÃO RESUMA, NÃO REESCREVA, NÃO ADICIONE NADA. Apenas copie o conteúdo integral.
    - **OFERTAS:** Se a pergunta for sobre "ofertas", busque o documento com "Resumo Ofertas" no título. Se encontrado, sua resposta DEVE ser uma transcrição EXATA e literal do conteúdo completo do documento. NÃO RESUMA, NÃO REESCREVA, NÃO ADIcione NADA.
    - **QUEM É alguém:** Busque arquivos com "organograma" E "identidade" no nome. Se a pergunta do usuário contiver um nome parcial (ex: "Paulo Caus" ou "Paulo Mesquita") e os documentos encontrados contiverem um nome completo que inclua o nome parcial (ex: "Paulo Caus Mesquita"), você DEVE assumir que são a mesma pessoa e que a busca foi bem-sucedida. Responda com a informação completa do documento.
    - **O QUE É algo:** Busque arquivos com "glossário" no nome.

4.  **FORMATAÇÃO:**
    - **Links:** Se a fonte de dados for um link, formate-o como um hyperlink em Markdown. Ex: [Título](url).
    - **Visual:** Para transcrições literais, use listas com marcadores ('*') e negrito ('**') para organizar e destacar os tópicos, melhorando a legibilidade.
    - **Jamais Responda "A resposta está no documento X".** Você DEVE abrir o documento e COPIAR o conteúdo relevante.

5.  **Hierarquia e Falha:** Responda estritamente com base nos documentos. Se a resposta não estiver neles, afirme clara e diretamente que a informação não foi encontrada na base de conhecimento interna e instrua o usuário a realizar a busca na web. NÃO tente adivinhar a resposta.

### EXEMPLO DE RESPOSTA OBRIGATÓRIA PARA A QUERY DO TIPO 'COMO FAZER':

Com base nos documentos encontrados, aqui estão os procedimentos:

**TUTORIAL ALTERAR SENHA - SITE**

- Acesse sua conta pelo site www.xpi.com.br.
- Clique em seu nome no canto superior direito da tela.
- Selecione "MEUS DADOS".
- ...

**TUTORIAL ALTERAR SENHA - APP**

- Acesse sua conta pelo aplicativo XP Investimentos.
- No menu, clique em "MEUS DADOS".
- Clique em "SEGURANÇA".
- ...
`;

const EXTRACT_XP_REPORT_PREAMBLE = `
Você é um assistente de extração de dados altamente preciso. Sua única tarefa é analisar o texto de um relatório de investimentos da XP e extrair informações específicas, retornando-as em um formato JSON.

**REGRAS ESTRITAS:**
1.  **Extraia os seguintes campos do texto:**
    -   'reportMonth': O MÊS de referência do relatório. Esta informação geralmente aparece próxima aos dados de rentabilidade mensal. Extraia o nome do mês (ex: 'Julho', 'Agosto').
    -   'monthlyReturn': RENTABILIDADE PERCENTUAL DO MÊS.
    -   'monthlyCdi': RENTABILIDADE EM %CDI DO MÊS.
    -   'monthlyGain': GANHO FINANCEIRO DO MÊS.
    -   'yearlyReturn': RENTABILIDADE PERCENTUAL DO ANO.
    -   'yearlyCdi': RENTABILIDADE EM %CDI DO ANO.
    -   'yearlyGain': GANHO FINANCEIRO DO ANO.
    -   'highlights': Na **página 5**, na seção 'Posição Detalhada dos Ativos', encontre e extraia uma lista com os dois ativos com a **maior** rentabilidade no mês. Para cada um, extraia o nome do ativo ('asset'), o percentual de retorno ('return'), e a justificativa ('reason').
    -   'detractors': Na **página 5**, na seção 'Posição Detalhada dos Ativos', encontre e extraia uma lista com os ativos cuja rentabilidade foi **inferior** ao CDI. Para cada um, extraia o nome do ativo ('asset') e o percentual de retorno ('return').
2.  **Formato de Saída:** A resposta DEVE ser um objeto JSON válido, contendo apenas os campos listados acima. Não inclua nenhum texto, explicação, ou formatação Markdown. Apenas o JSON.
3.  **Valores Numéricos:** Mantenha os valores exatamente como aparecem no texto (ex: "1,23%", "R$ 1.234,56").
4.  **Precisão:** Seja extremamente preciso. Se um valor não for encontrado, retorne uma string vazia ("") para aquele campo.
`;


async function getGeminiApiKey(): Promise<string> {
    if (process.env.GEMINI_API_KEY) {
        return process.env.GEMINI_API_KEY;
    }
    throw new Error('A variável de ambiente GEMINI_API_KEY não está definida.');
}

async function logDlpAlert(userId: string, chatId: string, foundInfoTypes: string[]) {
    if (!userId || !chatId || foundInfoTypes.length === 0) {
        return;
    }
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const alertRef = adminDb.collection('dlp_alerts').doc();
        await alertRef.set({
            userId,
            chatId,
            foundInfoTypes, 
            detectedAt: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error("Error logging DLP alert:", error);
    }
}

// IMPORTANTE: NÃO REMOVA o objeto `requestBody` da função deidentifyQuery.
// A API do Google DLP requer que os parâmetros `item`, `deidentifyConfig` e
// `inspectConfig` estejam aninhados dentro de um objeto `requestBody`.
// A remoção desta estrutura causará erros de 400 Bad Request.
async function deidentifyQuery(query: string, userId?: string | null, chatId?: string | null): Promise<{ deidentifiedQuery: string; foundInfoTypes: string[] }> {
    const {google} = require('googleapis');
    const credentials = await getServiceAccountCredentialsFromEnv();
    const projectId = credentials.project_id;
    
    if (!projectId) {
        throw new Error("O 'project_id' não foi encontrado nas credenciais da conta de serviço.");
    }
    
    const dlp = google.dlp({
        version: 'v2',
        auth: new GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        })
    });

    const parent = `projects/${projectId}/locations/global`;

    const request = {
        parent: parent,
        requestBody: {
            deidentifyConfig: {
                infoTypeTransformations: {
                    transformations: [
                        {
                            primitiveTransformation: {
                                replaceWithInfoTypeConfig: {},
                            },
                        },
                    ],
                },
            },
            inspectConfig: {
                infoTypes: [{ name: 'PERSON_NAME' }, { name: 'BRAZIL_CPF_NUMBER' }],
            },
            item: {
                value: query,
            },
        }
    };

    try {
        // @ts-ignore
        const [response] = await dlp.projects.content.deidentify(request);
        
        const deidentifiedQuery = response.item?.value || query;
        const findings = response.overview?.transformationSummaries?.[0]?.results || [];
        
        const foundInfoTypes = findings
          .map((result: any) => result.infoType?.name)
          .filter(Boolean) as string[];

        if (userId && chatId && foundInfoTypes.length > 0) {
            await logDlpAlert(userId, chatId, foundInfoTypes);
        }

        return { deidentifiedQuery, foundInfoTypes };

    } catch (error: any) {
        console.error('Error calling DLP API:', error.message);
        if (error.response && error.response.data && error.response.data.error) {
            console.error('DLP API Error Details:', JSON.stringify(error.response.data.error, null, 2));
        }
        if (error.message && (error.message.includes('permission') || error.message.includes('denied'))) {
             throw new Error(`Erro de permissão com a API DLP. Verifique se a conta de serviço tem o papel "Usuário de DLP".`);
        }
        console.error("DLP Error: Returning original query.");
        return { deidentifiedQuery: query, foundInfoTypes: [] };
    }
}

export async function deidentifyTextOnly(query: string): Promise<string> {
    const { deidentifiedQuery } = await deidentifyQuery(query);
    return deidentifiedQuery;
}

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
}> {
    const credentials = await getServiceAccountCredentialsFromEnv();
    
    const auth = new GoogleAuth({
      credentials,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();

    const location = 'global';
    const engineId = 'datavisorvscoderagtest_1751310702302';
    const collectionId = 'default_collection';
    const servingConfigId = 'default_search';

    const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/servingConfigs/${servingConfigId}:search`;
    
    try {
      const accessToken = (await client.getAccessToken()).token;

      if (!accessToken) {
        throw new Error(`Falha ao obter o token de acesso.`);
      }

      let fileContextPreamble = '';
      if (attachments.length > 0) {
          fileContextPreamble = attachments.map(file => 
              `\n\n### INÍCIO DO CONTEÚDO DO ARQUIVO: ${file.fileName} ###\n${file.deidentifiedContent}\n### FIM DO CONTEÚdo DO ARQUIVO: ${file.fileName} ###`
          ).join('');
      }
      
      const modelPrompt = `${preamble}${fileContextPreamble}`;

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
              includeCitations: false,
              modelPromptSpec: {
                preamble: modelPrompt
              },
              modelSpec: {
                version: "stable"
              }
            },
            extractiveContentSpec: {
                maxExtractiveAnswerCount: 5,
            }
        }
      };

      if (preamble === POSICAO_CONSOLIDADA_PREAMBLE) {
        requestBody.query = "faça a análise deste relatório";
      }

      const lowerCaseQuery = query.toLowerCase();
      if (lowerCaseQuery.startsWith("quem é ") || lowerCaseQuery.startsWith("quem e ")) {
          const name = query.substring(7).replace('?', '').trim();
          const nameParts = name.split(' ');
          if (nameParts.length > 1 && nameParts.length < 4) {
              const firstName = nameParts[0];
              const lastName = nameParts[nameParts.length - 1];
              const simplifiedName = `${firstName} ${lastName}`;
              requestBody.query = `${name} OR "${simplifiedName}"`;
          }
      }

      await logQuestionForAnalytics(query);
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

      const promptForTokenCount = modelPrompt + query;
      const promptTokenCount = await estimateTokens(promptForTokenCount);
      
      let sources: ClientRagSource[] = [];
      const summary = data.summary?.summaryText;
      const results = data.results || [];
      
      const failureKeywords = ["não tenho informações", "não consigo responder", "não é possível", "não foi possível encontrar", "não encontrei", "não tenho como", "não foram encontradas"];
      const summaryHasFailureKeyword = summary && failureKeywords.some(keyword => summary.toLowerCase().includes(keyword));

      if (!summary || results.length === 0 || summaryHasFailureKeyword) {
          return { 
              summary: "Com base nos dados internos não consigo realizar essa resposta. Clique no item abaixo caso deseje procurar na web",
              searchFailed: true,
              sources: [],
              promptTokenCount,
              candidatesTokenCount: 0,
          };
      }
      
      const tutorialResults = results.filter((result: any) => 
          result.document?.derivedStructData?.title?.toLowerCase().includes('tutorial')
      );

      if (tutorialResults.length > 0 && query.toLowerCase().includes('como fazer')) {
          let tutorialContent = "Com base nos documentos encontrados, aqui estão os procedimentos:\n\n";
          const formattedTutorials = await Promise.all(tutorialResults.map(async (result: any) => {
              const title = (result.document?.derivedStructData?.title || 'Tutorial').replace(/tutorial -/gi, '').trim();
              const rawContent = result.document?.derivedStructData?.extractive_answers?.[0]?.content || 'Conteúdo não encontrado.';
              const formattedContent = await formatTutorialToMarkdown(rawContent, title);
              return `**${title.toUpperCase()}**\n\n${formattedContent}`;
          }));
          tutorialContent += formattedTutorials.join('\n\n---\n\n');
          
          sources = tutorialResults.map((result: any) => ({
              title: (result.document?.derivedStructData?.title || 'Título não encontrado').replace(/tutorial -/gi, '').trim(),
              uri: result.document?.derivedStructData?.link || 'URI não encontrada',
          }));
          const candidatesTokenCount = await estimateTokens(tutorialContent);
          return { summary: tutorialContent, searchFailed: false, sources, promptTokenCount, candidatesTokenCount };
      }
      
      sources = results.map((result: any) => ({
          title: (result.document?.derivedStructData?.title || 'Título não encontrado').replace(/tutorial - /gi, '').trim(),
          uri: result.document?.derivedStructData?.link || 'URI não encontrada',
      }));
      
      const candidatesTokenCount = await estimateTokens(summary);
      return { summary, searchFailed: false, sources, promptTokenCount, candidatesTokenCount };

    } catch (error: any) {
      console.error("Error in callDiscoveryEngine:", error.message);
      if (error.message.includes('Could not refresh access token') || error.message.includes('permission')) {
         throw new Error(`Erro de permissão. Verifique no IAM se a conta de serviço tem o papel "Usuário do Discovery Engine".`);
      }
      throw error;
    }
}


async function callGemini(
    query: string,
    attachments: AttachedFile[] = [],
    preamble: string | null = null,
    enableWebSearch: boolean = false,
    jsonOutput: boolean = false
): Promise<{ summary: string; searchFailed: boolean; sources: ClientRagSource[]; promptTokenCount?: number; candidatesTokenCount?: number; }> {
    const geminiApiKey = await getGeminiApiKey();

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);

        const tools = enableWebSearch ? [{
            "google_search_retrieval": {}
        }] : [];

        const modelConfig: any = {
            model: "gemini-1.5-pro-latest",
            tools: tools as any,
        };

        if (jsonOutput) {
            modelConfig.generationConfig = {
                responseMimeType: "application/json",
            };
        }

        const model = genAI.getGenerativeModel(modelConfig);

        const chat = model.startChat();
        
        let finalPreamble = preamble || '';
        
        let promptWithContext = query;
        if (enableWebSearch) {
            promptWithContext = `**Instrução Adicional:** Baseie sua resposta nos seguintes trechos de busca da web. Responda de forma concisa e direta.\n\n**Pergunta do usuário:** "${query}"`;
        }
        
        const promptParts: Part[] = [];
        if (finalPreamble) {
            promptParts.push({ text: finalPreamble });
        }
        if (attachments.length > 0) {
            const fileParts = attachments.map(file =>
                `\n\n### INÍCIO DO CONTEÚDO DO ARQUIVO: ${file.fileName} ###\n${file.deidentifiedContent}\n### FIM DO CONTEÚDO DO ARQUIVO: ${file.fileName} ###`
            );
            promptParts.push({ text: fileParts.join('') });
        }
        promptParts.push({ text: promptWithContext });
        
        await logQuestionForAnalytics(query);
        let result = await chat.sendMessage(promptParts);

        const functionCalls = result.response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            result = await chat.sendMessage([{
                functionResponse: {
                    name: functionCalls[0].name,
                    response: {
                    },
                }
            }]);
        }

        const response = await result.response;
        const text = response.text();
        let sources: ClientRagSource[] = [];

        if (!text) {
             return { summary: '', searchFailed: true, sources: [] };
        }

        if (response.candidates?.[0]?.citationMetadata?.citationSources) {
             sources = response.candidates[0].citationMetadata.citationSources.map((source: any) => ({
                title: source.uri || 'Fonte da Web',
                uri: source.uri || '#',
             }));
        }

        return { summary: text, searchFailed: false, sources };

    } catch (error: any) {
        console.error("Error calling Gemini API:", error);
        if (error.message.includes('API key not valid')) {
            throw new Error(`Erro de autenticação com a API Gemini. Verifique se a GEMINI_API_KEY é válida.`);
        }
        throw error;
    }
}

export async function logQuestionForAnalytics(query: string): Promise<void> {
    const adminDb = await getAuthenticatedFirestoreAdmin();
    const crypto = require('crypto');

    const normalizedQuery = query.toLowerCase().trim().replace(/[?.,!]/g, '');

    if (!normalizedQuery) return;
    
    const queryHash = crypto.createHash('sha256').update(normalizedQuery).digest('hex');

    const analyticsRef = adminDb.collection('question_analytics').doc(queryHash);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const doc = await transaction.get(analyticsRef);
            if (!doc.exists) {
                transaction.set(analyticsRef, {
                    normalizedText: normalizedQuery,
                    count: 1,
                    lastAsked: FieldValue.serverTimestamp(),
                });
            } else {
                transaction.update(analyticsRef, {
                    count: FieldValue.increment(1),
                    lastAsked: FieldValue.serverTimestamp(),
                });
            }
        });
    } catch (error) {
        console.error('Error logging question for analytics:', error);
    }
}

export async function askAssistant(
  query: string,
  options: {
    source: 'rag' | 'web';
    useStandardAnalysis?: boolean;
    fileDataUris?: { name: string; dataUri: string; mimeType: string }[];
  }
): Promise<{
  summary?: string;
  searchFailed?: boolean;
  source?: 'rag' | 'web' | 'gemini';
  sources?: ClientRagSource[];
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  latencyMs?: number;
  error?: string;
}> {
    const { source, useStandardAnalysis = false, fileDataUris = [] } = options;
    const startTime = Date.now();
    let result;

    try {
        const attachments: AttachedFile[] = [];
        if (fileDataUris.length > 0) {
            for (const file of fileDataUris) {
                const content = await getFileContent(file.dataUri, file.mimeType);
                // The de-identification is now expected to happen before this function is called.
                // We just pass the original content for now, assuming it's already de-identified.
                attachments.push({
                    id: crypto.randomUUID(),
                    fileName: file.name,
                    // @ts-ignore
                    mimeType: file.type,
                    deidentifiedContent: content,
                });
            }
        }
        
        if (useStandardAnalysis) {
            result = await callGemini(query, attachments, POSICAO_CONSOLIDADA_PREAMBLE, false);
        } else if (source === 'web') {
            result = await callGemini(query, attachments, null, true);
        } else { // source === 'rag'
            result = await callDiscoveryEngine(
                query,
                attachments,
                ASSISTENTE_CORPORATIVO_PREAMBLE
            );
        }
        
        const latencyMs = Date.now() - startTime;
        
        if (!result || result.searchFailed) {
            return {
                summary: "Não foi possível obter uma resposta. Tente refazer a pergunta ou mudar a fonte de busca.",
                searchFailed: true,
                source: source,
                sources: [],
                latencyMs,
            };
        }
        
        return {
            summary: result.summary,
            searchFailed: false,
            source: source,
            sources: result.sources || [],
            promptTokenCount: result.promptTokenCount,
            candidatesTokenCount: result.candidatesTokenCount,
            latencyMs: latencyMs,
        };

    } catch (error: any) {
        const latencyMs = Date.now() - startTime;
        console.error(`Error in askAssistant:`, error);
        const errorMessage = `Ocorreu um erro ao processar sua solicitação: ${error.message}`;
        return { 
            summary: errorMessage,
            searchFailed: true,
            source: source,
            error: error.message,
            latencyMs,
        };
    }
}

export async function transcribeLiveAudio(base64Audio: string): Promise<string> {
    await getFirebaseAdminApp();
    const credentials = await getServiceAccountCredentialsFromEnv();
    const speechClient = new SpeechClient({ credentials });

    const audio = {
        content: base64Audio,
    };
    const config = {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 48000,
        languageCode: 'pt-BR',
        enableAutomaticPunctuation: true,
    };

    const request = {
        audio: audio,
        config: config,
    };

    try {
        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            ?.map(result => result.alternatives?.[0].transcript)
            .join('\n');
        return transcription || '';
    } catch (error: any) {
        console.error('ERROR T-200: Falha ao transcrever o áudio:', error);
        if (error.message.includes('permission') || error.message.includes('denied')) {
            throw new Error(`Erro de permissão com a API Speech-to-Text. Verifique se a conta de serviço tem o papel "Editor de Projeto" ou "Usuário de API Cloud Speech".`);
        }
        throw new Error(`Não foi possível processar o áudio. Detalhes: ${error.message}`);
    }
}

export async function regenerateAnswer(
  originalQuery: string,
  attachments: AttachedFile[],
  options: {
    isStandardAnalysis?: boolean;
    source: 'rag' | 'web';
  },
  userId?: string,
  chatId?: string,
): Promise<{ 
  summary?: string; 
  searchFailed?: boolean; 
  source?: 'rag' | 'web' | 'gemini';
  sources?: ClientRagSource[]; 
  promptTokenCount?: number; 
  candidatesTokenCount?: number; 
  latencyMs?: number; 
  deidentifiedQuery?: string;
  error?: string;
}> {
  try {
    const startTime = Date.now();
    let result;
    
    // De-identification should happen before calling this function,
    // so we assume originalQuery is already de-identified.
    const deidentifiedQuery = originalQuery;

    if (userId && chatId) {
        await logRegeneratedQuestion(userId, chatId, deidentifiedQuery, '');
    }

    if (options.isStandardAnalysis) {
        result = await callGemini(deidentifiedQuery, attachments, POSICAO_CONSOLIDADA_PREAMBLE);
    } else if (options.source === 'web') {
        result = await callGemini(deidentifiedQuery, attachments, null, true);
    } else { // source === 'rag'
        result = await callDiscoveryEngine(
            deidentifiedQuery,
            attachments,
            ASSISTENTE_CORPORATIVO_PREAMBLE
        );
    }
    
    const latencyMs = Date.now() - startTime;

    if (!result || !result.summary) {
        return {
            summary: "Não foi possível regenerar uma resposta.",
            searchFailed: true,
            source: options.source,
            sources: [],
            latencyMs,
        };
    }
    
    return { 
        summary: result.summary, 
        searchFailed: result.searchFailed, 
        source: options.source,
        sources: result.sources || [], 
        promptTokenCount: result.promptTokenCount,
        candidatesTokenCount: result.candidatesTokenCount,
        latencyMs: latencyMs,
        deidentifiedQuery: originalQuery,
    };
  } catch (error: any) {
    console.error("Error in regenerateAnswer (internal):", error.message);
    return { 
        summary: `Ocorreu um erro ao processar sua solicitação: ${error.message}`,
        searchFailed: true,
        source: options.source,
        error: error.message 
    };
  }
}

export async function logRegeneratedQuestion(
    userId: string,
    chatId: string,
    originalQuery: string,
    newResponse: string
) {
    if (!userId || !chatId) {
        console.error("User ID or Chat ID is missing, cannot log regenerated answer.");
        return;
    };
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const regeneratedRef = adminDb.collection('users').doc(userId).collection('regenerated_answers').doc();
        await regeneratedRef.set({
            userId,
            chatId,
            originalQuery,
            newResponse: newResponse, 
            regeneratedAt: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error("Error logging regenerated question to Firestore:", error);
    }
}


export async function generateSuggestedQuestions(
  query: string,
  answer: string
): Promise<string[]> {
  const geminiApiKey = await getGeminiApiKey();

  const prompt = `Baseado na pergunta do usuário e na resposta do assistente, gere 3 perguntas de acompanhamento curtas e relevantes que o usuário poderia fazer a seguir. Retorne APENAS um array JSON de strings, sem nenhum outro texto ou formatação. As perguntas devem ser concisas e em português.

  Pergunta do Usuário: "${query}"
  Resposta do Assistente: "${answer}"`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
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


export async function generateTitleForConversation(
  query: string,
  fileName?: string | null
): Promise<string> {
  const baseQuery = query;
  const fallbackTitle = baseQuery.length > 30 ? baseQuery.substring(0, 27) + '...' : baseQuery;
  
  const geminiApiKey = await getGeminiApiKey();

  const prompt = `Gere um título curto e descritivo em português com no máximo 5 palavras para a seguinte pergunta. Se a pergunta incluir o nome de um arquivo, o título deve refletir isso. Retorne APENAS o título, sem aspas, marcadores ou qualquer outro texto.

Pergunta: "${baseQuery}"`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      generationConfig: {
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const title = response.text().trim().replace(/"/g, '');

    if (title && title.length > 0 && title.length < 60) {
      return title;
    }
    
    return fallbackTitle;

  } catch (error: any) {
    console.error("Erro ao gerar título da conversa:", error.message);
    return fallbackTitle;
  }
}

export async function removeFileFromConversation(
  userId: string,
  chatId: string,
  fileId: string
): Promise<AttachedFile[]> {
    if (!userId || !chatId || !fileId) {
        throw new Error("User ID, Chat ID, and File ID are required.");
    }

    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const chatRef = adminDb.doc(`users/${userId}/chats/${chatId}`);
        const chatSnap = await chatRef.get();

        if (!chatSnap.exists) {
            throw new Error("Conversation not found.");
        }

        const chatData = chatSnap.data() as import('firebase-admin/firestore').DocumentData;
        const existingFiles: AttachedFile[] = chatData.attachedFiles || [];

        const updatedFiles = existingFiles.filter(file => file.id !== fileId);

        await chatRef.update({
            attachedFiles: updatedFiles,
        });

        return updatedFiles;
    } catch (error: any) {
        console.error("Error removing file from conversation:", error.message);
        throw new Error(error.message);
    }
}

function calculatePercentile(arr: number[], percentile: number): number {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const index = (percentile / 100) * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return arr[lower];
    const weight = index - lower;
    return arr[lower] * (1 - weight) + arr[upper] * weight;
}

export async function getAdminInsights(): Promise<any> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();

        const listUsersResult = await (await getAuthenticatedAuthAdmin()).listUsers();
        const totalUsers = listUsersResult.users.length;

        const chatsCollectionGroup = adminDb.collectionGroup('chats');
        const chatsSnapshot = await chatsCollectionGroup.get();

        let totalQuestions = 0;
        let ragSearchCount = 0;
        let webSearchCount = 0;
        let ragSearchFailureCount = 0;

        const userQuestionCounts: { [key: string]: number } = {};
        const interactionsByDayMap: { [key: string]: number } = {};
        const interactionsByHourMap: { [key: string]: number } = {};
        const sourceUsageMap: { [key: string]: { title: string; uri: string; count: number } } = {};

        const allLatencies: number[] = [];
        const ragLatencies: number[] = [];
        const webLatencies: number[] = [];
        const latencyByDayMap: { [key: string]: { totalLatency: number, count: number } } = {};

        chatsSnapshot.forEach(doc => {
            const messages = (doc.data().messages || []) as Message[];
            const userId = doc.ref.parent.parent?.id; 
            
            const chatCreatedAt = (doc.data().createdAt as import('firebase-admin/firestore').Timestamp).toDate();
            const gmtMinus3Offset = 3 * 60 * 60 * 1000;
            
            messages.forEach((m: Message) => {
                const interactionDate = new Date(chatCreatedAt.getTime() - gmtMinus3Offset);
                const dayKey = interactionDate.toISOString().split('T')[0];

                if (m.role === 'user') {
                    totalQuestions++;
                    if (userId) {
                        userQuestionCounts[userId] = (userQuestionCounts[userId] || 0) + 1;
                    }
                    
                    interactionsByDayMap[dayKey] = (interactionsByDayMap[dayKey] || 0) + 1;
                    
                    const hourKey = interactionDate.getUTCHours().toString().padStart(2, '0') + ':00';
                    interactionsByHourMap[hourKey] = (interactionsByHourMap[hourKey] || 0) + 1;
                }
                if (m.role === 'assistant') {
                    if (m.latencyMs && m.latencyMs > 0) {
                        allLatencies.push(m.latencyMs);

                        if (!latencyByDayMap[dayKey]) {
                            latencyByDayMap[dayKey] = { totalLatency: 0, count: 0 };
                        }
                        latencyByDayMap[dayKey].totalLatency += m.latencyMs;
                        latencyByDayMap[dayKey].count++;
                    }

                    if (m.source === 'web') {
                        webSearchCount++;
                        if (m.latencyMs) webLatencies.push(m.latencyMs);
                    } else if (m.source === 'rag') {
                        ragSearchCount++;
                        if (m.latencyMs) ragLatencies.push(m.latencyMs);
                        if (m.content === "Com base nos dados internos não consigo realizar essa resposta. Clique no item abaixo caso deseje procurar na web") {
                            ragSearchFailureCount++;
                        }

                        if (m.sources && m.sources.length > 0) {
                            m.sources.forEach(source => {
                                if (source.uri) {
                                    if (sourceUsageMap[source.uri]) {
                                        sourceUsageMap[source.uri].count++;
                                    } else {
                                        sourceUsageMap[source.uri] = {
                                            title: source.title,
                                            uri: source.uri,
                                            count: 1,
                                        };
                                    }
                                }
                            });
                        }
                    }
                }
            });
        });

        const interactionsByDay = Object.entries(interactionsByDayMap)
            .map(([date, count]) => {
                const [year, month, day] = date.split('-');
                return {
                    date, 
                    formattedDate: `${day}/${month}/${year}`, 
                    count,
                };
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const interactionsByHour = Object.entries(interactionsByHourMap)
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => a.hour.localeCompare(b.hour));
        
        const latencyByDay = Object.entries(latencyByDayMap)
            .map(([date, data]) => {
                const [year, month, day] = date.split('-');
                return {
                    date,
                    formattedDate: `${day}/${month}`,
                    latency: data.totalLatency / data.count,
                };
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());


        const questionsPerUser = totalUsers > 0 ? totalQuestions / totalUsers : 0;
        const usersWithMoreThanOneQuestion = Object.values(userQuestionCounts).filter(count => count > 1).length;
        const engagementRate = totalUsers > 0 ? (usersWithMoreThanOneQuestion / totalUsers) * 100 : 0;
        const totalSearches = ragSearchCount + webSearchCount;
        const webSearchRate = totalSearches > 0 ? (webSearchCount / totalSearches) * 100 : 0;
        const ragSearchFailureRate = ragSearchCount > 0 ? (ragSearchFailureCount / ragSearchCount) * 100 : 0;

        const analyticsCollection = adminDb.collection('question_analytics');
        const topQuestionsSnapshot = await analyticsCollection.orderBy('count', 'desc').limit(10).get();
        const topQuestions = topQuestionsSnapshot.docs.map(doc => {
            const data = doc.data();
            const lastAsked = data.lastAsked as import('firebase-admin/firestore').Timestamp;
            return {
                ...data,
                lastAsked: lastAsked.toDate().toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                }),
            };
        });

        const regenerationsCollectionGroup = adminDb.collectionGroup('regenerated_answers');
        const regenerationsSnapshot = await regenerationsCollectionGroup.get();
        const totalRegenerations = regenerationsSnapshot.size;

        const legalAlertsCollection = adminDb.collection('legal_issue_alerts');
        const legalAlertsSnapshot = await legalAlertsCollection.get();
        const totalLegalIssues = legalAlertsSnapshot.size;

        const mostUsedSources = Object.values(sourceUsageMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        
        const calculateAverage = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        const avgLatency = calculateAverage(allLatencies);
        const avgLatencyRag = calculateAverage(ragLatencies);
        const avgLatencyWeb = calculateAverage(webLatencies);
        const p95Latency = calculatePercentile(allLatencies, 95);
        const p99Latency = calculatePercentile(allLatencies, 99);


        return { 
            totalQuestions, 
            totalUsers, 
            questionsPerUser,
            engagementRate,
            totalRegenerations,
            webSearchCount,
            ragSearchCount,
            ragSearchFailureCount,
            ragSearchFailureRate,
            webSearchRate,
            topQuestions,
            interactionsByDay,
            interactionsByHour,
            latencyByDay,
            totalLegalIssues,
            mostUsedSources,
            avgLatency,
            avgLatencyRag,
            avgLatencyWeb,
            p95Latency,
            p99Latency,
        };
    } catch (error: any) {
        console.error("Error fetching admin insights:", error.message);
        return { error: `Não foi possível carregar os insights: ${error.message}` };
    }
}


export async function getUsersWithRoles(): Promise<any> {
    try {
        const authAdmin = await getAuthenticatedAuthAdmin();
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const listUsersResult = await authAdmin.listUsers();
        
        const usersFromAuth = listUsersResult.users;
        
        const userDocsPromises = usersFromAuth.map(user => 
            adminDb.collection('users').doc(user.uid).get()
        );
        
        const userDocsSnapshots = await Promise.all(userDocsPromises);
        
        const usersWithRoles = usersFromAuth.map((user, index) => {
            const userDoc = userDocsSnapshots[index];
            const userData = userDoc.data();
            return {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                role: userData?.role || 'user',
                createdAt: (userData?.createdAt as import('firebase-admin/firestore').Timestamp)?.toDate().toISOString() || user.metadata.creationTime,
                hasCompletedOnboarding: userData?.hasCompletedOnboarding ?? false,
            };
        });

        return usersWithRoles;

    } catch (error: any) {
        console.error('Error fetching users with roles:', error);
        return { error: `Não foi possível buscar a lista de usuários: ${error.message}` };
    }
}

export async function getPreRegisteredUsers(): Promise<any> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const preRegSnapshot = await adminDb.collection('pre_registered_users').get();
        
        if (preRegSnapshot.empty) {
            return [];
        }
        
        const preRegisteredUsers = preRegSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                email: doc.id,
                role: data.role,
                createdAt: (data.createdAt as import('firebase-admin/firestore').Timestamp)?.toDate().toISOString(),
            };
        });
        
        return preRegisteredUsers;

    } catch (error: any) {
        console.error('Error fetching pre-registered users:', error);
        return { error: `Não foi possível buscar a lista de usuários pré-registrados: ${error.message}` };
    }
}

export async function createUser(email: string, role: UserRole): Promise<{ success: boolean, error?: string }> {
    if (!email || !role) {
        return { success: false, error: 'Email e Papel são obrigatórios.' };
    }
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        
        const authAdmin = await getAuthenticatedAuthAdmin();
        try {
            await authAdmin.getUserByEmail(email);
            return { success: false, error: 'Este e-mail já está em uso por outro usuário no Firebase Authentication.' };
        } catch (error: any) {
            if (error.code !== 'auth/user-not-found') {
                throw error;
            }
        }

        const preRegRef = adminDb.collection('pre_registered_users').doc(email.toLowerCase());
        const preRegDoc = await preRegRef.get();
        if (preRegDoc.exists) {
            return { success: false, error: 'Este e-mail já está pré-registrado.' };
        }

        await preRegRef.set({
            role: role,
            createdAt: FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: any) {
        console.error(`Error pre-registering user ${email}:`, error);
        return { success: false, error: `Ocorreu um erro inesperado: ${error.message}` };
    }
}

export async function setUserRole(userId: string, role: UserRole): Promise<{success: boolean, error?: string}> {
    if (!userId || !role) {
        return { success: false, error: "UserID e Role são obrigatórios." };
    }

    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.set({ role: role }, { merge: true });

        return { success: true };
    } catch (error: any) {
        console.error(`Error setting role for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

export async function setUserOnboardingStatus(userId: string, status: boolean): Promise<{success: boolean, error?: string}> {
    if (!userId) {
        return { success: false, error: "UserID é obrigatório." };
    }

    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.set({ hasCompletedOnboarding: status }, { merge: true });

        return { success: true };
    } catch (error: any) {
        console.error(`Error setting onboarding status for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

export async function deleteUser(userId: string): Promise<{success: boolean, error?: string}> {
     if (!userId) {
        return { success: false, error: "UserID é obrigatório." };
    }
    try {
        const authAdmin = await getAuthenticatedAuthAdmin();
        const adminDb = await getAuthenticatedFirestoreAdmin();
        
        // Delete from Auth
        await authAdmin.deleteUser(userId);
        
        // Delete from Firestore
        const userRef = adminDb.collection('users').doc(userId);
        await userRef.delete();

        // Optionally, delete their subcollections too if needed (e.g., chats, groups)
        // This part can be complex and requires careful handling. For now, we delete the main user doc.

        return { success: true };
    } catch (error: any) {
         console.error(`Error deleting user ${userId}:`, error);
         return { success: false, error: error.message };
    }
}

export async function getLegalIssueAlerts(): Promise<any> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const authAdmin = await getAuthenticatedAuthAdmin();
        
        const alertsSnapshot = await adminDb.collection('legal_issue_alerts').get();

        if (alertsSnapshot.empty) {
            return [];
        }

        const userIds = [...new Set(alertsSnapshot.docs.map(doc => doc.data().userId))];
        const userPromises = userIds.map(uid => authAdmin.getUser(uid).catch(() => null));
        const userResults = await Promise.all(userPromises);
        
        const userMap = new Map<string, any>();
        userResults.forEach(user => {
            if (user) {
                userMap.set(user.uid, {
                    email: user.email,
                    displayName: user.displayName,
                });
            }
        });

        const alerts = alertsSnapshot.docs.map(doc => {
            const data = doc.data();
            const reportedAt = data.reportedAt as import('firebase-admin/firestore').Timestamp;
            const userInfo = userMap.get(data.userId);

            return {
                id: doc.id,
                ...data,
                user: userInfo || { email: 'Usuário não encontrado', displayName: data.userId },
                reportedAt: reportedAt.toDate().toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                }),
            };
        });

        return alerts;
    } catch (error: any) {
        console.error('Error fetching legal issue alerts:', error);
        return { error: `Não foi possível buscar os alertas jurídicos: ${error.message}` };
    }
}


export async function getFeedbacks(): Promise<any> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const authAdmin = await getAuthenticatedAuthAdmin();
        
        const feedbacksSnapshot = await adminDb.collectionGroup('feedbacks').get();

        if (feedbacksSnapshot.empty) {
            return { positive: [], negative: [] };
        }

        const userIds = [...new Set(feedbacksSnapshot.docs.map(doc => doc.data().userId))];
        const userPromises = userIds.map(uid => authAdmin.getUser(uid).catch(() => null));
        const userResults = await Promise.all(userPromises);
        
        const userMap = new Map<string, any>();
        userResults.forEach(user => {
            if (user) {
                userMap.set(user.uid, {
                    email: user.email,
                    displayName: user.displayName,
                });
            }
        });

        const allFeedbacks = feedbacksSnapshot.docs.map(doc => {
            const data = doc.data();
            const updatedAt = data.updatedAt as import('firebase-admin/firestore').Timestamp;
            const userInfo = userMap.get(data.userId);

            return {
                id: doc.id,
                ...data,
                user: userInfo || { email: 'Usuário não encontrado', displayName: data.userId },
                updatedAt: updatedAt.toDate().toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                }),
            };
        });

        const positive = allFeedbacks.filter(f => f.rating === 'positive');
        const negative = allFeedbacks.filter(f => f.rating === 'negative');

        return { positive, negative };

    } catch (error: any) {
        console.error('Error fetching feedbacks:', error);
        return { error: `Não foi possível buscar os feedbacks: ${error.message}` };
    }
}

export async function getAdminCosts(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // This is mock data. In a real scenario, you would fetch this from a billing API.
    const mockData = {
        currentMonthCost: 125.40,
        costPerMillionInputTokens: 0.50,
        costPerMillionOutputTokens: 1.50,
        monthlyCostForecast: 250.80,
        costByService: [
            { service: 'Vertex AI Search', cost: 75.24 },
            { service: 'Gemini API', cost: 45.16 },
            { service: 'Cloud DLP', cost: 2.50 },
            { service: 'Outros', cost: 2.50 },
        ],
    };

    return mockData;
}


// ---- System Settings ----

export async function getMaintenanceMode(): Promise<any> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const settingsRef = adminDb.collection('system_settings').doc('config');
        const docSnap = await settingsRef.get();

        if (docSnap.exists) {
            return { isMaintenanceMode: docSnap.data()?.isMaintenanceMode || false };
        }
        // Default to not in maintenance if the document doesn't exist
        return { isMaintenanceMode: false };
    } catch (error: any) {
        console.error("Error getting maintenance mode:", error);
        return { error: error.message, isMaintenanceMode: false };
    }
}

export async function setMaintenanceMode(isMaintenanceMode: boolean): Promise<any> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const settingsRef = adminDb.collection('system_settings').doc('config');
        await settingsRef.set({ isMaintenanceMode }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting maintenance mode:", error);
        return { success: false, error: error.message };
    }
}

export async function getGreetingMessage(): Promise<string> {
    const defaultMessage = 'Olá! Eu sou o Bob, o Assistente Corporativo da 3A RIVA.';
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const contentRef = adminDb.collection('system_settings').doc('content');
        const docSnap = await contentRef.get();

        if (docSnap.exists) {
            return docSnap.data()?.greetingMessage || defaultMessage;
        }
        return defaultMessage;
    } catch (error: any) {
        console.error("Error getting greeting message:", error);
        return defaultMessage;
    }
}

export async function setGreetingMessage(greetingMessage: string): Promise<{ success: boolean, error?: string }> {
    if (!greetingMessage) {
        return { success: false, error: 'A mensagem de saudação não pode estar vazia.' };
    }
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const contentRef = adminDb.collection('system_settings').doc('content');
        await contentRef.set({ greetingMessage }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting greeting message:", error);
        return { success: false, error: error.message };
    }
}


export async function runApiHealthCheck(): Promise<any> {
    const results = [];
    
    // Test DLP API
    let dlpStartTime = Date.now();
    try {
        await deidentifyQuery("test query");
        results.push({
            api: 'Google Cloud DLP',
            status: 'OK',
            latency: Date.now() - dlpStartTime,
        });
    } catch (e: any) {
        results.push({
            api: 'Google Cloud DLP',
            status: 'Erro',
            latency: Date.now() - dlpStartTime,
            error: e.message,
        });
    }

    // Test Discovery Engine (RAG)
    let ragStartTime = Date.now();
    try {
        await callDiscoveryEngine("teste", []);
        results.push({
            api: 'Vertex AI Search (RAG)',
            status: 'OK',
            latency: Date.now() - ragStartTime,
        });
    } catch (e: any) {
        results.push({
            api: 'Vertex AI Search (RAG)',
            status: 'Erro',
            latency: Date.now() - ragStartTime,
            error: e.message,
        });
    }
    
    // Test Gemini API (Web Search)
    let geminiStartTime = Date.now();
    try {
        const res = await callGemini("teste", [], null, true);
        if (res.error) throw new Error(res.error);
        results.push({
            api: 'Google Gemini API',
            status: 'OK',
            latency: Date.now() - geminiStartTime,
        });
    } catch (e: any) {
        results.push({
            api: 'Google Gemini API',
            status: 'Erro',
            latency: Date.now() - geminiStartTime,
            error: e.message,
        });
    }

    // Test Custom Search API - Removed as it's no longer in use
    
    return { results };
}


export async function validateAndOnboardUser(
    uid: string, 
    email: string, 
    displayName: string | null
): Promise<{ success: boolean; role: UserRole | null; error?: string }> {
    if (!uid || !email) {
        return { success: false, role: null, error: 'UID e Email são obrigatórios.' };
    }

    const adminDb = await getAuthenticatedFirestoreAdmin();

    try {
        const userDocRef = adminDb.collection('users').doc(uid);
        const userDocSnap = await userDocRef.get();

        if (userDocSnap.exists) {
            // User already exists, just return their role
            return { success: true, role: userDocSnap.data()?.role || 'user' };
        }

        // New user, check pre-registration
        const preRegRef = adminDb.collection('pre_registered_users').doc(email.toLowerCase());
        const preRegSnap = await preRegRef.get();

        if (!preRegSnap.exists) {
            // Not pre-registered
            return { success: false, role: null, error: 'Seu e-mail não está autorizado a acessar este sistema.' };
        }

        // Pre-registered, create user document and delete pre-registration
        const role = preRegSnap.data()?.role || 'user';
        const newUserData = {
            uid,
            email,
            displayName: displayName || 'Usuário',
            createdAt: FieldValue.serverTimestamp(),
            role,
            termsAccepted: false,
            hasCompletedOnboarding: false,
        };
        
        const batch = adminDb.batch();
        batch.set(userDocRef, newUserData);
        batch.delete(preRegRef);
        
        await batch.commit();

        return { success: true, role };

    } catch (error: any) {
        console.error('Erro durante a validação e onboarding do usuário:', error);
        return { success: false, role: null, error: `Ocorreu um erro no servidor: ${error.message}` };
    }
}


export async function extractDataFromXpReport(fileDataUri: { name: string; dataUri: string, mimeType: string }): Promise<any> {
    try {
        const textContent = await getFileContent(fileDataUri.dataUri, fileDataUri.mimeType);

        const result = await callGemini(textContent, [], EXTRACT_XP_REPORT_PREAMBLE, false, true);

        if (result.searchFailed || !result.summary) {
            throw new Error("A extração de dados do relatório falhou. A IA não retornou um JSON válido.");
        }

        const jsonData = JSON.parse(result.summary);
        return { success: true, data: jsonData };

    } catch (error: any) {
        console.error("Error in extractDataFromXpReport:", error);
        return { success: false, error: `Falha ao extrair dados do relatório: ${error.message}` };
    }
}
