
'use server';

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore as getFirestoreAdmin, FieldValue, DocumentData, Timestamp as AdminTimestamp, writeBatch } from 'firebase-admin/firestore';
import { getAuth as getAuthAdmin } from 'firebase-admin/auth';
import { AttachedFile, UserRole } from '@/types';
import { Message, RagSource as ClientRagSource } from '@/app/chat/page';
import { google } from 'googleapis';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import { SpeechClient } from '@google-cloud/speech';


const ASSISTENTE_CORPORATIVO_PREAMBLE = `Siga estas regras ESTRITAS:

1.  **IDENTIDADE:** Seu tom de voz é profissional, claro e estruturado. Use listas e tabelas. A resposta de saudação só deve ser utilizada caso o usuário solicite.

2.  **REGRA DE TRANSCRIÇÃO (CRÍTICA):**
    - **SAUDAÇÃO:** Se a pergunta for uma saudação (Olá, Bom dia, etc.), procure o documento "RESPOSTA_SAUDACAO" e transcreva seu conteúdo.
    - **COMO FAZER algo:** Se a busca encontrar documentos com "tutorial" no nome, sua resposta DEVE ser uma transcrição EXATA e literal do conteúdo desses arquivos. NÃO RESUMA, NÃO REESCREVA, NÃO ADICIONE NADA. Apenas copie o conteúdo integral.
    - **QUEM É alguém:** Busque arquivos com "organograma" E "identidade" no nome.
    - **O QUE É algo:** Busque arquivos com "glossário" no nome.

3.  **FORMATAÇÃO:**
    - **Links:** Se a fonte de dados for um link, formate-o como um hyperlink em Markdown. Ex: [Título](url).
    - **Visual:** Para transcrições literais, use listas com marcadores ('*') e negrito ('**') para organizar e destacar os tópicos, melhorando a legibilidade.
    - **Jamais Responda "A resposta está no documento X".** Você DEVE abrir o documento e COPIAR o conteúdo relevante.

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

const POSICAO_CONSOLIDADA_PREAMBLE = `Você é um especialista em finanças. Com base em um relatório de investimentos em PDF da XP, extraia:
:pino: Da página 2:
[RENTABILIDADE PERCENTUAL DO MÊS]
[RENTABILIDADE EM %CDI DO MÊS]
[GANHO FINANCEIRO DO MÊS]
[RENTABILIDADE PERCENTUAL DO ANO]
[RENTABILIDADE EM %CDI DO ANO]
[GANHO FINANCEIRO DO ANO]
:pino: Da página 5:
Duas classes com maior rentabilidade no mês, com seus respectivos percentuais e uma breve justificativa baseada nos ativos da carteira
Duas classes com rentabilidade inferior ao CDI no mês, apenas com nome e percentual. Caso a classe Inflação aparecer na lista, justificar a baixa rentabilidade à baixa inflação do mês anterior
:balão_de_fala: Monte uma mensagem personalizada com esse modelo, usando asteriscos para a formatação de WhatsApp e sem formatação automática do chat:
Olá!
Em julho sua carteira rendeu [RENTABILIDADE PERCENTUAL DO MÊS], o que equivale a [RENTABILIDADE EM %CDI DO MÊS], um ganho bruto de [GANHO FINANCEIRO DO MÊS]! No ano, estamos com uma rentabilidade de [RENTABILIDADE PERCENTUAL DO ANO], o que equivale a uma performance de [RENTABILIDADE EM %CDI DO ANO] e um ganho financeiro de [GANHO FINANCEIRO DO ANO]!
Os principais destaques foram:
[Classe 1], com [rentabilidade], [justificativa]
[Classe 2], com [rentabilidade], [justificativa]
Os principais detratores foram:
[Classe 1]: [rentabilidade]
[Classe 2]: [rentabilidade]
Em julho de 2025, o assunto da vez no mercado brasileiro foram as imposições de tarifas de 50% por parte dos Estados Unidos sobre uma série de produtos nacionais. A incerteza inicial sobre o alcance dessas medidas afetou negativamente o sentimento dos investidores, pressionando o Ibovespa, que recuou 4,17% no mês. Ao final do mês, a divulgação de uma lista de quase 700 itens isentos trouxe algum alívio, com destaque para os setores de aviação e laranja. Contudo, setores como o de carne bovina seguiram pressionados. No campo monetário, o Copom manteve a taxa Selic em 15%, como esperado, diante das persistentes incertezas inflacionárias. Por outro lado, tivemos bons dados econômicos: o IGP-M registrou nova deflação, o IPCA-15 avançou 0,33% (abaixo da expectativa) e a taxa de desemprego caiu para 5,8%, o menor patamar da série. O FMI também revisou para cima a projeção de crescimento do PIB brasileiro para 2,3% em 2025.
No cenário internacional, as tensões comerciais continuaram no centro das atenções. Além das tarifas direcionadas ao Brasil, os Estados Unidos mantiveram postura rígida nas negociações com a União Europeia e a China, o que gerou receios quanto ao impacto sobre o comércio global. O Federal Reserve optou por manter a taxa de juros no intervalo de 4,25% a 4,5% ao ano, em linha com as expectativas, reforçando um discurso de cautela diante do cenário externo desafiador. Apesar das incertezas, o S&P 500 avançou 2,17% no mês, refletindo a resiliência dos mercados americanos frente ao ambiente de maior aversão ao risco e reação aos bons resultados divulgados pelas empresas.`;

let adminApp: App | null = null;

function getServiceAccountCredentials() {
    const serviceAccountKeyBase64 = process.env.SERVICE_ACCOUNT_KEY_INTERNAL;

    if (!serviceAccountKeyBase64) {
        throw new Error('A variável de ambiente SERVICE_ACCOUNT_KEY_INTERNAL não está definida ou está vazia.');
    }

    try {
        const decodedKey = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf-8');
        return JSON.parse(decodedKey);
    } catch (error: any) {
        console.error("Falha ao decodificar ou analisar a chave da conta de serviço.", error.message);
        throw new Error(`Falha ao processar a chave da conta de serviço: ${'' + error.message}`);
    }
}

function getFirebaseAdminApp() {
    if (adminApp) {
        return adminApp;
    }

    const appName = 'firebase-admin-app-singleton';
    const existingApp = getApps().find(app => app.name === appName);
    if (existingApp) {
        adminApp = existingApp;
        return adminApp;
    }
    
    try {
        const serviceAccount = getServiceAccountCredentials();
        adminApp = initializeApp({
            credential: cert(serviceAccount)
        }, appName);
    } catch (error: any) {
        console.error("Falha ao inicializar o Admin SDK do Firebase com as credenciais da conta de serviço:", error.message);
        throw new Error("Não foi possível inicializar os serviços de backend. Verifique a configuração da conta de serviço.");
    }

    return adminApp;
}


function getAuthenticatedFirestoreAdmin() {
    const app = getFirebaseAdminApp();
    return getFirestoreAdmin(app);
}

function getAuthenticatedAuthAdmin() {
    const app = getFirebaseAdminApp();
    return getAuthAdmin(app);
}

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
        const adminDb = getAuthenticatedFirestoreAdmin();
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


async function deidentifyQuery(query: string): Promise<{ deidentifiedQuery: string; foundInfoTypes: string[] }> {
    const credentials = getServiceAccountCredentials();
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

    const infoTypesToDetect = [{ name: 'PERSON_NAME' }, { name: 'BRAZIL_CPF_NUMBER'}];
    
    const request = {
        parent: parent,
        requestBody: {
            item: {
                value: query,
            },
            deidentifyConfig: {
                infoTypeTransformations: {
                    transformations: [
                        {
                            infoTypes: infoTypesToDetect,
                            primitiveTransformation: {
                                replaceWithInfoTypeConfig: {},
                            },
                        },
                    ],
                },
            },
            inspectConfig: {
                infoTypes: infoTypesToDetect,
                minLikelihood: 'LIKELY',
                includeQuote: true,
            },
        }
    };

    try {
        const response = await dlp.projects.content.deidentify(request);
        
        const deidentifiedQuery = response.data.item?.value || query;
        const findings = response.data.overview?.transformationSummaries?.[0]?.results || [];
        
        const foundInfoTypes = findings
          .map((result: any) => result.infoType?.name)
          .filter(Boolean) as string[];

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


function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

async function getFileContent(fileDataUri: string, mimeType: string): Promise<string> {
    const base64Data = fileDataUri.split(',')[1];
    if (!base64Data) {
        throw new Error('Formato de Data URI inválido.');
    }

    const fileBuffer = Buffer.from(base64Data, 'base64');

    if (mimeType === 'application/pdf') {
        try {
            const data = await pdf(fileBuffer);
            return data.text;
        } catch (error: any) {
            console.error("Error parsing PDF:", error);
            throw new Error(`Falha ao processar o arquivo PDF: ${error.message}`);
        }
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
        mimeType === 'application/msword' // .doc
    ) {
        try {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            return result.value;
        } catch (error: any) {
            console.error("Error parsing Word document:", error);
            throw new Error(`Falha ao processar o arquivo Word: ${error.message}`);
        }
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
        mimeType === 'application/vnd.ms-excel' // .xls
    ) {
        try {
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            let fullText = '';
            workbook.SheetNames.forEach(sheetName => {
                fullText += `\n\n### Início da Planilha: ${sheetName} ###\n\n`;
                const worksheet = workbook.Sheets[sheetName];
                const sheetData = xlsx.utils.sheet_to_csv(worksheet, { header: 1 });
                fullText += sheetData;
                fullText += `\n\n### Fim da Planilha: ${sheetName} ###\n`;
            });
            return fullText;
        } catch (error: any) {
            console.error("Error parsing Excel file:", error);
            throw new Error(`Falha ao processar o arquivo Excel: ${error.message}`);
        }
    }

    
    throw new Error(`O processamento de arquivos do tipo '${mimeType}' não é suportado.`);
}

function formatTutorialToMarkdown(rawContent: string, title: string): string {
    if (!rawContent) return 'Conteúdo não encontrado.';

    let processedContent = rawContent.trim();
    
    const titleToRemove = `TUTORIAL - ${title.toUpperCase()}`;
    if (processedContent.toUpperCase().startsWith(titleToRemove)) {
        processedContent = processedContent.substring(titleToRemove.length).trim();
    }
    
    const lines = processedContent.split('\n');
    let markdownResult = '';

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) return;

        // Matches lines that are all caps, likely subtitles
        const isAllCaps = /^[A-ZÀ-Ú\s]+$/.test(trimmedLine) && /[A-Z]/.test(trimmedLine);

        if (isAllCaps && trimmedLine.split(' ').length > 1) {
             markdownResult += `\n\n**${trimmedLine.trim()}**\n\n`;
        } else {
            // Splits content by '.' to create list items, for text that is not a subtitle
            const listItems = trimmedLine.split('. ').filter(item => item.trim() !== '');
            listItems.forEach(item => {
                markdownResult += `- ${item.trim()}\n`;
            });
        }
    });

    return markdownResult.trim();
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
    const credentials = getServiceAccountCredentials();
    
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
              `\n\n### INÍCIO DO CONTEÚDO DO ARQUIVO: ${file.fileName} ###\n${file.deidentifiedContent}\n### FIM DO CONTEÚDO DO ARQUIVO: ${file.fileName} ###`
          ).join('');
      }
      
      const modelPrompt = `${preamble}${fileContextPreamble}`;

      const requestBody: any = {
        query: preamble === POSICAO_CONSOLIDADA_PREAMBLE ? "faça a análise deste relatório" : query,
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

      if (!data) {
          throw new Error("A chamada ao Discovery Engine retornou uma resposta vazia.");
      }

      const promptForTokenCount = modelPrompt + query;
      const promptTokenCount = estimateTokens(promptForTokenCount);
      const failureMessage = "Com base nos dados internos não consigo realizar essa resposta. Clique no item abaixo caso deseje procurar na web";
      
      let sources: ClientRagSource[] = [];
      const summary = data.summary?.summaryText;
      const results = data.results || [];
      
      const tutorialResults = results.filter((result: any) => 
          result.document?.derivedStructData?.title?.toLowerCase().includes('tutorial')
      );

      if (tutorialResults.length > 0 && query.toLowerCase().includes('como fazer')) {
          let tutorialContent = "Com base nos documentos encontrados, aqui estão os procedimentos:\n\n";
          tutorialContent += tutorialResults.map((result: any) => {
              const title = (result.document?.derivedStructData?.title || 'Tutorial').replace(/tutorial -/gi, '').trim();
              const rawContent = result.document?.derivedStructData?.extractive_answers?.[0]?.content || 'Conteúdo não encontrado.';
              const formattedContent = formatTutorialToMarkdown(rawContent, title);
              return `**${title.toUpperCase()}**\n\n${formattedContent}`;
          }).join('\n\n---\n\n');
          
          sources = tutorialResults.map((result: any) => ({
              title: (result.document?.derivedStructData?.title || 'Título não encontrado').replace(/tutorial -/gi, '').trim(),
              uri: result.document?.derivedStructData?.link || 'URI não encontrada',
          }));
          const candidatesTokenCount = estimateTokens(tutorialContent);
          return { summary: tutorialContent, searchFailed: false, sources, promptTokenCount, candidatesTokenCount };
      }

      if (!summary || results.length === 0) {
          const candidatesTokenCount = estimateTokens(failureMessage);
          return { 
              summary: failureMessage, 
              searchFailed: true,
              sources: [],
              promptTokenCount,
              candidatesTokenCount,
          };
      }
      
      const searchFailed = summary.trim() === failureMessage.trim();

      if (results.length > 0) {
          sources = results.map((result: any) => ({
              title: (result.document?.derivedStructData?.title || 'Título não encontrado').replace(/tutorial - /gi, '').trim(),
              uri: result.document?.derivedStructData?.link || 'URI não encontrada',
          }));
      }
      
      if (searchFailed) {
        const candidatesTokenCount = estimateTokens(summary);
        return { 
          summary, 
          searchFailed: true,
          sources: [],
          promptTokenCount,
          candidatesTokenCount,
        };
      }
      
      const candidatesTokenCount = estimateTokens(summary);
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
    preamble: string | null = null
): Promise<{ summary: string; searchFailed: boolean; sources: ClientRagSource[]; promptTokenCount?: number; candidatesTokenCount?: number; }> {
    const geminiApiKey = await getGeminiApiKey();

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        
        let fileContextPreamble = '';
        if (attachments.length > 0) {
            fileContextPreamble = attachments.map(file => 
                `\n\n### INÍCIO DO CONTEÚDO DO ARQUIVO: ${file.fileName} ###\n${file.deidentifiedContent}\n### FIM DO CONTEÚDO DO ARQUIVO: ${file.fileName} ###`
            ).join('');
        }

        const finalPrompt = `
            ${preamble || 'Responda em português do Brasil, a menos que seja solicitado o contrário na pergunta.'}
            ${fileContextPreamble}
            
            Pergunta do usuário: "${query}"
        `;

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();
        
        const promptTokenCount = undefined;
        const candidatesTokenCount = undefined;

        return { summary: text, searchFailed: false, sources: [], promptTokenCount, candidatesTokenCount };

    } catch (error: any) {
        console.error("Error calling Gemini API:", error);
        if (error.message.includes('API key not valid')) {
            throw new Error(`Erro de autenticação com a API Gemini. Verifique se a GEMINI_API_KEY é válida.`);
        }
        throw new Error(error.message);
    }
}


export async function logQuestionForAnalytics(query: string): Promise<void> {
    const adminDb = getAuthenticatedFirestoreAdmin();
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
    useWebSearch?: boolean;
    useStandardAnalysis?: boolean;
    fileDataUris?: { name: string; dataUri: string, mimeType: string }[];
    chatId?: string | null;
    messageId?: string | null;
  } = {},
  userId?: string | null
): Promise<{
  summary?: string;
  searchFailed?: boolean;
  source?: 'rag' | 'web' | 'transcription' | 'gemini';
  sources?: ClientRagSource[];
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  latencyMs?: number;
  deidentifiedQuery?: string;
  error?: string;
}> {
  const { useWebSearch = false, useStandardAnalysis = false, fileDataUris = [], chatId, messageId } = options;
  const startTime = Date.now();
  
  try {
    let result;
    let source: 'rag' | 'web' | 'transcription' | 'gemini';
    
    let finalQuery = query;

    const { deidentifiedQuery, foundInfoTypes } = await deidentifyQuery(finalQuery);

    if (userId && chatId && foundInfoTypes.length > 0) {
        await logDlpAlert(userId, chatId, foundInfoTypes);
    }
    
    const attachments: AttachedFile[] = [];
    if (fileDataUris.length > 0) {
        for (const file of fileDataUris) {
            const content = await getFileContent(file.dataUri, file.mimeType);
            const { deidentifiedQuery: deidentifiedContent } = await deidentifyQuery(content);
            attachments.push({
                id: crypto.randomUUID(),
                fileName: file.name,
                mimeType: file.mimeType,
                deidentifiedContent: deidentifiedContent,
            });
        }
    }

    if (useStandardAnalysis) {
        result = await callGemini(deidentifiedQuery, attachments, POSICAO_CONSOLIDADA_PREAMBLE);
        source = 'gemini';
    } else if (useWebSearch) {
      result = await callGemini(deidentifiedQuery);
      source = 'web';
    } else {
        await logQuestionForAnalytics(deidentifiedQuery);
        result = await callDiscoveryEngine(
            deidentifiedQuery,
            attachments,
            ASSISTENTE_CORPORATIVO_PREAMBLE
        );
        source = 'rag';
    }

    if (!result || typeof result.summary === 'undefined') {
        throw new Error("A chamada ao serviço de IA retornou uma resposta vazia ou malformada.");
    }
    
    const latencyMs = Date.now() - startTime;

    return {
        summary: result.summary,
        searchFailed: result.searchFailed,
        source: source,
        sources: result.sources || [],
        promptTokenCount: result.promptTokenCount,
        candidatesTokenCount: result.candidatesTokenCount,
        latencyMs: latencyMs,
        deidentifiedQuery: finalQuery !== deidentifiedQuery ? deidentifiedQuery : undefined,
    };
  } catch (error: any) {
    console.error("Error in askAssistant:", error.message);
    const failureMessage = "Com base nos dados internos não consigo realizar essa resposta. Clique no item abaixo caso deseje procurar na web";
    return { 
        summary: failureMessage, 
        searchFailed: true,
        source: 'rag',
        error: error.message 
    };
  }
}

export async function transcribeLiveAudio(base64Audio: string): Promise<string> {
    const credentials = getServiceAccountCredentials();
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
  } = {},
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
    let source: 'rag' | 'web' | 'gemini';

    const { deidentifiedQuery, foundInfoTypes } = await deidentifyQuery(originalQuery);

    if (userId && chatId && foundInfoTypes.length > 0) {
        await logDlpAlert(userId, chatId, foundInfoTypes);
    }
    
    if (userId && chatId) {
        await logRegeneratedQuestion(userId, chatId, deidentifiedQuery, '');
    }

    if (options.isStandardAnalysis) {
        result = await callGemini(deidentifiedQuery, attachments, POSICAO_CONSOLIDADA_PREAMBLE);
        source = 'gemini';
    } else {
        result = await callDiscoveryEngine(
            deidentifiedQuery,
            attachments,
            ASSISTENTE_CORPORATIVO_PREAMBLE
        );
        source = 'rag';
    }
    
    const latencyMs = Date.now() - startTime;

    if (!result) {
        throw new Error("A chamada para regenerar a resposta retornou uma resposta vazia.");
    }
    
    return { 
        summary: result.summary, 
        searchFailed: result.searchFailed, 
        source: source,
        sources: result.sources || [], 
        promptTokenCount: result.promptTokenCount,
        candidatesTokenCount: result.candidatesTokenCount,
        latencyMs: latencyMs,
        deidentifiedQuery: originalQuery !== deidentifiedQuery ? deidentifiedQuery : undefined,
    };
  } catch (error: any) {
    console.error("Error in regenerateAnswer (internal):", error.message);
    return { error: error.message };
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
        const adminDb = getAuthenticatedFirestoreAdmin();
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
        const adminDb = getAuthenticatedFirestoreAdmin();
        const chatRef = adminDb.doc(`users/${userId}/chats/${chatId}`);
        const chatSnap = await chatRef.get();

        if (!chatSnap.exists) {
            throw new Error("Conversation not found.");
        }

        const chatData = chatSnap.data() as DocumentData;
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
        const adminDb = getAuthenticatedFirestoreAdmin();

        const listUsersResult = await getAuthenticatedAuthAdmin().listUsers();
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
            
            const chatCreatedAt = (doc.data().createdAt as AdminTimestamp).toDate();
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
            const lastAsked = data.lastAsked as AdminTimestamp;
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
        const authAdmin = getAuthenticatedAuthAdmin();
        const adminDb = getAuthenticatedFirestoreAdmin();
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
                createdAt: (userData?.createdAt as AdminTimestamp)?.toDate().toISOString() || user.metadata.creationTime,
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
        const adminDb = getAuthenticatedFirestoreAdmin();
        const preRegSnapshot = await adminDb.collection('pre_registered_users').get();
        
        if (preRegSnapshot.empty) {
            return [];
        }
        
        const preRegisteredUsers = preRegSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                email: doc.id,
                role: data.role,
                createdAt: (data.createdAt as AdminTimestamp)?.toDate().toISOString(),
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
        const adminDb = getAuthenticatedFirestoreAdmin();
        
        const authAdmin = getAuthenticatedAuthAdmin();
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
        const adminDb = getAuthenticatedFirestoreAdmin();
        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.set({ role: role }, { merge: true });

        return { success: true };
    } catch (error: any) {
        console.error(`Error setting role for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

export async function deleteUser(userId: string): Promise<{success: boolean, error?: string}> {
     if (!userId) {
        return { success: false, error: "UserID é obrigatório." };
    }
    try {
        const authAdmin = getAuthenticatedAuthAdmin();
        const adminDb = getAuthenticatedFirestoreAdmin();
        
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
        const adminDb = getAuthenticatedFirestoreAdmin();
        const authAdmin = getAuthenticatedAuthAdmin();
        
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
            const reportedAt = data.reportedAt as AdminTimestamp;
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
        const adminDb = getAuthenticatedFirestoreAdmin();
        const authAdmin = getAuthenticatedAuthAdmin();
        
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
            const updatedAt = data.updatedAt as AdminTimestamp;
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
        const adminDb = getAuthenticatedFirestoreAdmin();
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
        const adminDb = getAuthenticatedFirestoreAdmin();
        const settingsRef = adminDb.collection('system_settings').doc('config');
        await settingsRef.set({ isMaintenanceMode }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting maintenance mode:", error);
        return { error: error.message };
    }
}

export async function getGreetingMessage(): Promise<string> {
    const defaultMessage = 'Olá! Eu sou o Bob, o Assistente Corporativo da 3A RIVA.';
    try {
        const adminDb = getAuthenticatedFirestoreAdmin();
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
        const adminDb = getAuthenticatedFirestoreAdmin();
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
        const res = await callGemini("teste");
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

    const adminDb = getAuthenticatedFirestoreAdmin();

    try {
        // 1. Verificar se o usuário já existe na coleção 'users'
        const userDocRef = adminDb.collection('users').doc(uid);
        const userDocSnap = await userDocRef.get();

        if (userDocSnap.exists()) {
            // Usuário já existe e está configurado, login permitido.
            return { success: true, role: userDocSnap.data()?.role || 'user' };
        }

        // 2. Se não existe, verificar a coleção 'pre_registered_users'
        const preRegRef = adminDb.collection('pre_registered_users').doc(email);
        const preRegSnap = await preRegRef.get();

        if (!preRegSnap.exists()) {
            // E-mail não está na lista de permissões, acesso negado.
            return { success: false, role: null, error: 'Seu e-mail não está autorizado a acessar este sistema.' };
        }

        // 3. Usuário está pré-registrado. Criar o usuário final e remover o pré-registro.
        const role = preRegSnap.data()?.role || 'user';
        const newUserData = {
            uid,
            email,
            displayName: displayName || 'Usuário',
            createdAt: FieldValue.serverTimestamp(),
            role,
            termsAccepted: false,
        };
        
        // Usar um batch para garantir a atomicidade da operação
        const batch = adminDb.batch();
        batch.set(userDocRef, newUserData); // Cria o documento do usuário final
        batch.delete(preRegRef);          // Remove o documento de pré-registro
        
        await batch.commit();

        return { success: true, role };

    } catch (error: any) {
        console.error('Erro durante a validação e onboarding do usuário:', error);
        return { success: false, role: null, error: `Ocorreu um erro no servidor: ${error.message}` };
    }
}
