
'use server';

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuthenticatedFirestoreAdmin, getAuthenticatedAuthAdmin, getFirebaseAdminApp, getServiceAccountCredentialsFromEnv } from '@/lib/server/firebase';
import { AttachedFile, UltraBatchReportResponse, UltraBatchReportRequest, UserRole, Message, GenerateUploadUrlsRequest, GenerateUploadUrlsResponse} from '@/types';
// Definição local para evitar import de componente client-side
type ClientRagSource = {
  title: string;
  uri: string;
};
import { SpeechClient } from '@google-cloud/speech';
import { estimateTokens, getFileContent, formatTutorialToMarkdown } from '@/lib/server/utils';
import { POSICAO_CONSOLIDADA_PREAMBLE, XP_REPORT_EXTRACTION_PREAMBLE } from './chat/preambles';
import { acknowledgeUpdate as coreAcknowledgeUpdate } from '@/lib/server/core/userActions';
import { ReportAnalyzeAutoRequest, ReportAnalyzePersonalizedRequest, BatchReportRequest, ReportAnalyzeResponse, BatchReportResponse, ExtractedData } from '@/types';



const ASSISTENTE_CORPORATIVO_PREAMBLE = `Siga estas regras ESTRITAS:

1.  **CONTEXTO PRINCIPAL:** O termo "a empresa" refere-se SEMPRE à "3A RIVA". Todos os documentos fornecidos são sobre a 3A RIVA. Responda perguntas como "Quem é o CEO da empresa?" e "Quem é o CEO da 3A RIVA?" com a mesma informação baseada nos documentos.

2.  **IDENTIDADE:** Seu tom de voz é profissional, claro e estruturado. Use listas e tabelas. A resposta de saudação só deve ser utilizada caso o usuário solicite.

3.  **REGRA DE TRANSCRIÇÃO (CRÍTICA):** Esta regra tem prioridade máxima.
    - **RAG IRRELEVANTE**: Caso os documentos retornados não sejam suficientes, responda: "Com base nos dados internos não consigo realizar essa resposta. Clique no seletor abaixo caso deseje procurar na web"
    - **SAUDAÇÃO:** Se a pergunta for uma saudação (Olá, Bom dia, etc.), procure o documento "RESPOSTA_SAUDACAO" e transcreva seu conteúdo EXATAMENTE.
    - **TUTORIAIS:** Se a busca encontrar documentos com "tutorial" no nome, sua resposta DEVE ser uma transcrição EXATA e literal do conteúdo de TODOS os arquivos encontrados. NÃO RESUMA, NÃO REESCREVA, NÃO ADICIONE NADA. Apenas copie o conteúdo integral. Esta regra prevalece sobre a regra 4.
    - **OFERTAS:**
      - **CONDIÇÃO:** Se a pergunta do usuário contiver a palavra "ofertas".
      - **AÇÃO:** Busque documentos que contenham "alocacao", "ofertas" e "mes" no título.
      - **RESPOSTA:** Se encontrados, sua resposta DEVE ser uma transcrição EXATA e literal do conteúdo completo dos documentos. NÃO RESUMA, NÃO REESCREVA, NÃO ADICIONE NADA.
    - **QUEM É alguém:** Busque arquivos com "organograma" E "identidade" no nome. Se a pergunta do usuário contiver um nome parcial (ex: "Paulo Caus" ou "Paulo Mesquita") e os documentos encontrados contiverem um nome completo que inclua o nome parcial (ex: "Paulo Caus Mesquita"), você DEVE assumir que são a mesma pessoa e que a busca foi bem-sucedida. Responda com a informação completa do documento.
    - **O QUE É algo:** Busque arquivos com "glossário" no nome.

4.  **HIERARQUIA DE FONTES (IMPORTANTE):** Se o primeiro documento retornado pela busca contiver uma resposta completa e direta para a pergunta do usuário, priorize-o de forma absoluta. Use os outros documentos apenas para contexto adicional, se for estritamente necessário. NÃO misture informações de outros documentos se a resposta principal já estiver clara e completa no primeiro.

5.  **FORMATAÇÃO:**
    - **Links:** Se a fonte de dados for um link, formate-o como um hyperlink em Markdown. Ex: [Título](url).
    - **Visual:** Use listas com marcadores ('*') e negrito ('**') para organizar e destacar os tópicos, melhorando a legibilidade.
    - **Para casos que NÃO são de transcrição literal (item 3)**: Jamais responda "A resposta está no documento X". Você DEVE abrir o documento e COPIAR o conteúdo relevante para formar sua resposta.

6.  **Hierarquia e Falha:** Responda estritamente com base nos documentos. Se a resposta não estiver neles, afirme clara e diretamente que a informação não foi encontrada na base de conhecimento interna e instrua o usuário a realizar a busca na web. NÃO tente adivinhar a resposta.

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
export async function deidentifyQuery(query: string, userId?: string | null, chatId?: string | null): Promise<{ deidentifiedQuery: string; foundInfoTypes: string[] }> {
    if (!query || query.trim() === '') {
        return { deidentifiedQuery: query, foundInfoTypes: [] };
    }
    
    const {google} = require('googleapis');
    const {GoogleAuth} = require('google-auth-library'); // Importação mais explícita
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
        // --- MUDANÇA PRINCIPAL AQUI ---
        // Chamamos a API e esperamos o objeto de resposta completo.
        const response = await dlp.projects.content.deidentify(request);

        // O corpo da resposta geralmente fica na propriedade 'data'.
        const responseData = response.data;

        // Verificamos se a resposta ou o item principal existem.
        if (!responseData || !responseData.item) {
            console.warn("DLP API retornou uma resposta sem o item esperado. Retornando a query original.");
            return { deidentifiedQuery: query, foundInfoTypes: [] };
        }
        
        const deidentifiedQuery = responseData.item.value || query;
        const transformationSummaries = responseData.overview?.transformationSummaries;
        const findings = transformationSummaries && transformationSummaries.length > 0 ? transformationSummaries[0].results || [] : [];
        
        const foundInfoTypes = findings
          .map((result: any) => result.infoType?.name)
          .filter(Boolean) as string[];

        if (userId && chatId && foundInfoTypes.length > 0) {
            await logDlpAlert(userId, chatId, foundInfoTypes);
        }

        console.log(`DLP check complete. Found infoTypes: [${foundInfoTypes.join(', ')}]`);
        return { deidentifiedQuery, foundInfoTypes };

    } catch (error: any) {
        console.error('Error calling DLP API:', error.message);
        if (error.response && error.response.data && error.response.data.error) {
            console.error('DLP API Error Details:', JSON.stringify(error.response.data.error, null, 2));
        }
        console.error("DLP Error: Returning original query.");
        return { deidentifiedQuery: query, foundInfoTypes: [] };
    }
}

export async function deidentifyTextOnly(query: string): Promise<string> {
    const { deidentifiedQuery } = await deidentifyQuery(query);
    return deidentifiedQuery;
}

export async function callDiscoveryEngine(
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
      
      // -- CONDIÇÃO --
      const isOffersQuery = query.toLowerCase().includes('ofertas');

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
                maxExtractiveSegmentCount: 5,
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
      const results = data.results || [];
      
      // -- AÇÃO e RESPOSTA para OFERTAS --
      if (isOffersQuery && results.length > 0) {
        const offerResult = results.find((result: any) => {
            const title = result.document?.derivedStructData?.title?.toLowerCase();
            return title && title.includes('alocacao') && title.includes('ofertas');
        });

        if (offerResult && offerResult.document?.derivedStructData?.extractive_answers) {
            const fullContent = offerResult.document.derivedStructData.extractive_answers
                .map((ans: any) => ans.content)
                .join("\n\n---\n\n");
            
            if (fullContent) {
                const offerSources: ClientRagSource[] = [{
                    title: offerResult.document.derivedStructData.title,
                    uri: offerResult.document.derivedStructData.link || 'URI não encontrada',
                }];
                const candidatesTokenCount = await estimateTokens(fullContent);
                return { summary: fullContent, searchFailed: false, sources: offerSources, promptTokenCount, candidatesTokenCount };
            }
        }
      }


      const tutorialResults = results.filter((result: any) => 
          result.document?.derivedStructData?.title?.toLowerCase().includes('tutorial')
      );

      if (tutorialResults.length > 0) {
          let combinedContent = "Com base nos documentos encontrados, aqui estão os procedimentos:\n\n";
          let tutorialSources: ClientRagSource[] = [];

          const tutorialContents = await Promise.all(tutorialResults.map(async (result: any) => {
              const title = (result.document?.derivedStructData?.title || 'Tutorial').replace(/tutorial - /gi, '').trim();
              const extractiveAnswers = result.document?.derivedStructData?.extractive_answers;
              
              let rawContent = "Conteúdo do tutorial não pôde ser extraído diretamente.";
              if (extractiveAnswers && extractiveAnswers.length > 0) {
                  rawContent = extractiveAnswers.map((ans: any) => ans.content).join("\n\n");
              }
              
              tutorialSources.push({
                  title: title,
                  uri: result.document?.derivedStructData?.link || 'URI não encontrada',
              });
              
              return `**${title.toUpperCase()}**\n\n${await formatTutorialToMarkdown(rawContent, title)}`;
          }));
          
          combinedContent += tutorialContents.join('\n\n---\n\n');
          const candidatesTokenCount = await estimateTokens(combinedContent);
          
          return { summary: combinedContent, searchFailed: false, sources: tutorialSources, promptTokenCount, candidatesTokenCount };
      }
      
      const summary = data.summary?.summaryText;
      const failureKeywords = ["não tenho informações", "não consigo responder", "não é possível", "não foi possível encontrar", "não encontrei", "não tenho como", "não foram encontradas"];
      const summaryHasFailureKeyword = summary && failureKeywords.some(keyword => summary.toLowerCase().includes(keyword));

      if (!summary || results.length === 0 || summaryHasFailureKeyword) {
          return { 
              summary: "Com base nos dados internos não consigo realizar essa resposta. Clique no seletor abaixo caso deseje procurar na web",
              searchFailed: true,
              sources: [],
              promptTokenCount,
              candidatesTokenCount: 0,
          };
      }
      
      sources = results.map((result: any) => ({
          title: (result.document?.derivedStructData?.title || 'Título não encontrado').replace(/tutorial - /gi, '').trim(),
          uri: result.document?.derivedStructData?.link || 'URI não encontrada',
      }));

      const finalSummary = summary;
      
      const candidatesTokenCount = await estimateTokens(finalSummary);
      return { summary: finalSummary, searchFailed: false, sources, promptTokenCount, candidatesTokenCount };

    } catch (error: any) {
      console.error("Error in callDiscoveryEngine:", error.message);
      if (error.message.includes('Could not refresh access token') || error.message.includes('permission')) {
         throw new Error(`Erro de permissão. Verifique no IAM se a conta de serviço tem o papel "Usuário do Discovery Engine".`);
      }
      throw error;
    }
}


export async function callGemini(
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
            googleSearch: {}
        }] : [];

        const modelConfig: any = {
            model: "gemini-2.5-flash",
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
            promptWithContext = `**Instrução Adicional:** Baseie sua resposta nos seguintes trechos de busca da web. Responda de forma concisa e direta. Responda sempre em Português do Brasil.\n\n**Pergunta do usuário:** "${query}"`;
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
                attachments.push({
                    id: crypto.randomUUID(),
                    fileName: file.name,
                    mimeType: file.mimeType,
                    storagePath: '', // Not applicable for direct URI processing
                    downloadURL: '', // Not applicable
                    deidentifiedContent: content, // Assuming content is de-identified if needed
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
      model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash",
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

export async function validateAndOnboardUser(
    uid: string, 
    email: string, 
    displayName: string | null
): Promise<{ success: boolean; role: UserRole | null; error?: string }> {
    if (!uid || !email) {
        return { success: false, role: null, error: 'UID e Email são obrigatórios.' };
    }

    const allowedDomains = ['@3ariva.com.br', '@3ainvestimentos.com.br'];
    const isDomainAllowed = allowedDomains.some(domain => email.toLowerCase().endsWith(domain));

    if (!isDomainAllowed) {
        return { success: false, role: null, error: 'Seu domínio de e-mail não tem permissão para acessar este sistema.' };
    }

    const adminDb = await getAuthenticatedFirestoreAdmin();

    try {
        const userDocRef = adminDb.collection('users').doc(uid);
        const userDocSnap = await userDocRef.get();

        if (userDocSnap.exists) {
            return { success: true, role: userDocSnap.data()?.role || 'user' };
        }

        const role: UserRole = 'user';
        const newUserData = {
            uid,
            email,
            displayName: displayName || 'Usuário',
            createdAt: FieldValue.serverTimestamp(),
            role,
            termsAccepted: false,
            hasCompletedOnboarding: false,
        };
        
        await userDocRef.set(newUserData);

        return { success: true, role };

    } catch (error: any) {
        console.error('Erro durante a validação e onboarding do usuário:', error);
        return { success: false, role: null, error: `Ocorreu um erro no servidor: ${error.message}` };
    }
}


export async function extractDataFromXpReport(fileDataUri: { name: string; dataUri: string, mimeType: string }): Promise<any> {
    try {
        const textContent = await getFileContent(fileDataUri.dataUri, fileDataUri.mimeType);

        const result = await callGemini(textContent, [], XP_REPORT_EXTRACTION_PREAMBLE, false, true);

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

export async function acknowledgeUpdate(userId: string, versionId: string): Promise<{ success: boolean }> {
    // A Server Action agora simplesmente chama a lógica de negócio do nosso novo módulo.
    return coreAcknowledgeUpdate(userId, versionId);
}    


/**
 * Analisa uma transcrição de reunião usando o serviço Python
 */
export async function analyzeMeetingTranscript(file: File): Promise<{
    success: boolean;
    summary: string;
    opportunities: Array<{
        title: string;
        description: string;
        priority: string;
        clientMentions?: string[];
    }>;
    metadata: any;
  }> {
    try {
      // Validar arquivo
      if (!file.name.endsWith('.docx')) {
        throw new Error('Apenas arquivos .docx são aceitos');
      }
  
      // Criar FormData
      const formData = new FormData();
      formData.append('file', file);
  
      // URL do serviço Python (ajustar conforme necessário)
      const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
      
      // Fazer requisição para o serviço Python
      const response = await fetch(`${pythonServiceUrl}/api/analyze`, {
        method: 'POST',
        body: formData,
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro ao processar arquivo');
      }
  
      const result = await response.json();
      return result;
  
    } catch (error) {
      console.error('Erro ao analisar transcrição:', error);
      throw new Error('Erro interno do servidor');
    }
  }

  // ============= NOVAS ACTIONS PARA API DE RELATÓRIOS =============

/**
 * Análise automática de relatório
 */
export async function analyzeReportAuto(
    base64Content: string,
    fileName: string,
    userId: string
  ): Promise<ReportAnalyzeResponse> {
    try {
      const request: ReportAnalyzeAutoRequest = {
        file_content: base64Content,
        file_name: fileName,
        user_id: userId
      };
  
      const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
      
      const response = await fetch(`${pythonServiceUrl}/api/report/analyze-auto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro ao processar relatório');
      }
  
      const result: ReportAnalyzeResponse = await response.json();
      return result;
  
    } catch (error: any) {
      console.error('Erro ao analisar relatório (auto):', error);
      return {
        success: false,
        error: error.message || 'Erro interno do servidor'
      };
    }
  }
  
  /**
   * Análise personalizada de relatório
   */
  export async function analyzeReportPersonalized(
    base64Content: string,
    fileName: string,
    userId: string,
    selectedFields: {
      monthlyReturn?: boolean;
      yearlyReturn?: boolean;
      classPerformance?: { [className: string]: boolean };
    }
  ): Promise<ReportAnalyzeResponse> {
    try {
      const request: ReportAnalyzePersonalizedRequest = {
        file_content: base64Content,
        file_name: fileName,
        user_id: userId,
        selected_fields: selectedFields
      };
  
      const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
      
      const response = await fetch(`${pythonServiceUrl}/api/report/analyze-personalized`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro ao processar relatório');
      }
  
      const result: ReportAnalyzeResponse = await response.json();
      return result;
  
    } catch (error: any) {
      console.error('Erro ao analisar relatório (personalizado):', error);
      return {
        success: false,
        error: error.message || 'Erro interno do servidor'
      };
    }
  }
  
  /**
   * Apenas extração de dados (para UI de seleção)
   */
  export async function extractReportData(
    base64Content: string,
    fileName: string,
    userId: string
  ): Promise<{ success: boolean; data?: ExtractedData; error?: string }> {
    try {
      const request: ReportAnalyzeAutoRequest = {
        file_content: base64Content,
        file_name: fileName,
        user_id: userId
      };
  
      const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
      
      const response = await fetch(`${pythonServiceUrl}/api/report/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro ao extrair dados');
      }
  
      const result: ReportAnalyzeResponse = await response.json();
      
      if (!result.success || !result.extracted_data) {
        throw new Error(result.error || 'Falha na extração de dados');
      }
  
      // Converter para formato compatível com PromptBuilderDialog
      const extractedData: ExtractedData = result.extracted_data;
      
      return {
        success: true,
        data: extractedData
      };
  
    } catch (error: any) {
      console.error('Erro ao extrair dados do relatório:', error);
      return {
        success: false,
        error: error.message || 'Erro interno do servidor'
      };
    }
  }
  
  /**
   * Processamento em lote de relatórios
   */
  export async function batchAnalyzeReports(
    files: Array<{ name: string; dataUri: string }>,
    userId: string
  ): Promise<BatchReportResponse> {
    try {
      const request: BatchReportRequest = {
        files: files,
        user_id: userId
      };
  
      const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';

      // 🔍 LOG: Confirmar endpoint sendo usado
      //console.log('🔍 API Call - analise XP report:', `${pythonServiceUrl}/api/analyze`);
      //console.log('🔍 NEXT_PUBLIC_PYTHON_SERVICE_URL:', process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'fallback-localhost');
            
      const response = await fetch(`${pythonServiceUrl}/api/report/batch-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro ao processar lote');
      }
  
      const result: BatchReportResponse = await response.json();
      return result;
  
    } catch (error: any) {
      console.error('Erro ao processar lote de relatórios:', error);
      return {
        success: false,
        results: [],
        error: error.message || 'Erro interno do servidor'
      };
    }
  }

  /**
 * Gera Signed URLs para upload direto ao GCS.
 * 
 * Frontend usa essas URLs para fazer upload paralelo dos arquivos,
 * bypassando completamente o servidor Next.js.
 * 
 * @param fileNames - Lista de nomes dos arquivos para upload
 * @param userId - ID do usuário
 * @param chatId - ID do chat (opcional)
 * @returns Response com batch_id e Signed URLs para cada arquivo
 */
export async function generateUploadUrls(
  fileNames: string[],
  userId: string,
  chatId?: string
): Promise<GenerateUploadUrlsResponse> {
  try {
    const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
    
    if (!pythonServiceUrl) {
      throw new Error("A URL do serviço Python não está configurada.");
    }

    const request: GenerateUploadUrlsRequest = {
      file_names: fileNames,
      user_id: userId,
      ...(chatId && { chat_id: chatId })
    };

    console.log('🔗 [SIGNED-URL] Solicitando Signed URLs para', fileNames.length, 'arquivos...');

    const response = await fetch(`${pythonServiceUrl}/api/report/generate-upload-urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ [SIGNED-URL] Erro na API do Python: ${response.status}`, errorBody);
      throw new Error(`Falha ao gerar Signed URLs: ${response.statusText}`);
    }

    const result: GenerateUploadUrlsResponse = await response.json();
    console.log('✅ [SIGNED-URL] Signed URLs recebidas, batch_id:', result.batch_id);
    return result;
  } catch (error: any) {
    console.error("❌ [SIGNED-URL] Erro ao solicitar Signed URLs:", error);
    throw new Error('Falha ao gerar Signed URLs para upload.', { cause: error });
  }
}

  /**
 * Processamento em ultra lote de relatórios (até 100 arquivos)
 * 
 * @param batchId - ID do batch (retornado por generateUploadUrls)
 * @param userId - ID do usuário
 * @param chatId - ID do chat (opcional)
 * @returns Response com job_id e informações do processamento
 */
  export async function ultraBatchAnalyzeReports(
    batchId: string,
    userId: string,
    chatId?: string
  ): Promise<UltraBatchReportResponse> {
    try {
      const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
      
      if (!pythonServiceUrl) {
        throw new Error("A URL do serviço Python não está configurada.");
      }
  
      const request: UltraBatchReportRequest = {
        batch_id: batchId,
        user_id: userId,
        ...(chatId && { chat_id: chatId })
      };
  
      console.log('🚀 [ULTRA-BATCH] Notificando backend para iniciar processamento, batch_id:', batchId);
  
      const response = await fetch(`${pythonServiceUrl}/api/report/ultra-batch-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
  
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ [ULTRA-BATCH] Erro na API do Python: ${response.status}`, errorBody);
        throw new Error(`A análise de relatórios falhou: ${response.statusText}`);
      }
  
      const result: UltraBatchReportResponse = await response.json();
      console.log('✅ [ULTRA-BATCH] Processamento iniciado, job_id:', result.job_id);
      return result;
    } catch (error: any) {
      console.error("❌ [ULTRA-BATCH] Erro ao iniciar análise em ultra lote:", error);
      throw new Error('Falha ao processar a solicitação de análise em ultra lote.', { cause: error });
    }
  }

// ============= GOOGLE SHEETS / DIGITAL WHITELIST =============

export async function checkDigitalWhitelist(
  userId: string
): Promise<{ authorized: boolean }> {
  try {
    const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';

    const response = await fetch(`${pythonServiceUrl}/api/report/ultra-batch/check-whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!response.ok) {
      throw new Error(`Erro ao verificar whitelist: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Erro em checkDigitalWhitelist:', error);
    return { authorized: false };
  }
}

export async function configureGoogleSheets(
  jobId: string,
  userId: string,
  customName?: string
): Promise<{
  success: boolean;
  spreadsheet_id?: string;
  spreadsheet_url?: string;
  spreadsheet_name?: string;
  error?: string;
}> {
  try {
    const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';

    const response = await fetch(`${pythonServiceUrl}/api/report/ultra-batch/configure-sheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        user_id: userId,
        ...(customName && { custom_name: customName }),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Erro: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Erro em configureGoogleSheets:', error);
    return { success: false, error: error.message || 'Erro ao configurar Google Sheets' };
  }
}

export async function getGoogleSheetsConfig(
  jobId: string
): Promise<{
  configured: boolean;
  spreadsheet_id?: string;
  spreadsheet_url?: string;
  spreadsheet_name?: string;
  enabled?: boolean;
}> {
  try {
    const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';

    const response = await fetch(`${pythonServiceUrl}/api/report/ultra-batch/sheets-config/${jobId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Erro: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Erro em getGoogleSheetsConfig:', error);
    return { configured: false };
  }
}

// ============= PERSONALIZED FROM DATA =============

export async function analyzeReportPersonalizedFromData(
  extractedData: ExtractedData,
  selectedFields: any,
  fileName: string,
  userId: string
): Promise<ReportAnalyzeResponse> {
  try {
      // ✅ CORREÇÃO: Adicionar fallback para PYTHON_SERVICE_URL
      const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
      console.log('🔍 DEBUG - NEXT_PUBLIC_PYTHON_SERVICE_URL:', pythonServiceUrl);
      
      const response = await fetch(`${pythonServiceUrl}/api/report/analyze-personalized-from-data`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              extracted_data: extractedData,
              selected_fields: selectedFields,
              file_name: fileName,
              user_id: userId
          }),
      });

      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      //console.log('🔍 DEBUG - analyzeReportPersonalizedFromData result:', result);
      //console.log('🔍 DEBUG - Retornando result para PromptBuilderDialog');
      return result;

  } catch (error) {
    console.log('🔍 DEBUG - ERRO em analyzeReportPersonalizedFromData:', error);
    console.error('Erro na análise personalizada:', error);
    return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
}
}