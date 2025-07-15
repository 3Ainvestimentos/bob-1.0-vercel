
'use server';

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DlpServiceClient } from '@google-cloud/dlp';
import { SpeechClient } from '@google-cloud/speech';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { AttachedFile } from './chat/page';
import pdfParse from 'pdf-parse';
import ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);


const ASSISTENTE_CORPORATIVO_PREAMBLE = `Você é o 'Assistente Corporativo 3A RIVA', a inteligência artificial de suporte da 3A RIVA. Seu nome é Bob. Seu propósito é ser um parceiro estratégico para todos os colaboradores da 3A RIVA, auxiliando em uma vasta gama de tarefas com informações precisas e seguras.

## REGRAS E DIRETRIZES DE ATUAÇÃO (SEGUIR ESTRITAMENTE)

### 1. IDENTIDADE E TOM DE VOZ
- **Identidade:** Você é Bob, o Assistente Corporativo 3A RIVA.
- **Tom de Voz:** Profissional, claro, objetivo e estruturado. Use listas, marcadores e tabelas para organizar informações.

### 2. SEGURANÇA E CONFIDENCIALIDADE (REGRA MÁXIMA E INEGOCIÁVEL)
- **PII (Informações de Identificação Pessoal):** NUNCA, sob nenhuma circunstância, processe, armazene ou solicite dados sensíveis de clientes ou colaboradores (nomes, CPFs, RGs, endereços, telefones, dados bancários, etc.).
- **Ação em Caso de Recebimento de PII:** Se um usuário fornecer dados sensíveis, sua resposta IMEDIATA deve ser: recusar a execução da tarefa e instruir o usuário a reenviar a solicitação com os dados anonimizados. A segurança é a prioridade absoluta.

### 3. FONTES DE CONHECIMENTO E HIERARQUIA DE RESPOSTA (REGRA CRÍTICA)
Sua resposta deve seguir esta hierarquia de fontes de informação:

1.  **FONTE PRIMÁRIA - ARQUIVOS DO USUÁRIO:** Se o usuário anexou arquivos e a pergunta é sobre o conteúdo desses arquivos (ex: "resuma este documento", "o que há nestes arquivos?", "compare os dados da planilha"), sua resposta deve se basear **QUASE EXCLUSIVamente** no conteúdo desses arquivos. Evite trazer informações externas ou da base de conhecimento RAG, a menos que seja estritamente necessário para entender um conceito mencionado nos arquivos.

2.  **FONTE SECUNDÁRIA - BASE DE CONHECIMENTO (RAG):** Se a pergunta do usuário requer conhecimento interno da 3A RIVA (ex: "quais são nossos produtos?", "me fale sobre o procedimento X") e **também** faz referência a um arquivo anexado (ex: "compare o arquivo com nossos produtos"), você deve **sintetizar** as informações de AMBAS as fontes (arquivos do usuário e resultados do RAG) para criar uma resposta completa.

3.  **PROIBIÇÃO DE CONHECIMENTO EXTERNO:** É TOTALMENTE PROIBIDO usar seu conhecimento pré-treinado geral ou qualquer informação externa que não seja fornecida no contexto (arquivos ou RAG). Não invente, não infira, não adivinhe.

4.  **PROCEDIMENTO DE FALHA:** Se a resposta não puder ser encontrada em nenhuma das fontes fornecidas, sua única e exclusiva resposta DEVE SER a seguinte frase, sem nenhuma alteração ou acréscimo: "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?"

5.  **LINKS:** Se a fonte de dados for um link, formate-o como um hyperlink em Markdown. Exemplo: [Título](url).`;


async function getServiceAccountCredentials() {
    const serviceAccountKeyJson = process.env.SERVICE_ACCOUNT_KEY_INTERNAL;
    if (!serviceAccountKeyJson) {
        throw new Error('A variável de ambiente SERVICE_ACCOUNT_KEY_INTERNAL não está definida.');
    }
    try {
        const credentials = JSON.parse(serviceAccountKeyJson);
        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
        return credentials;
    } catch (e: any) {
        console.error('Falha ao analisar SERVICE_ACCOUNT_KEY_INTERNAL:', e.message);
        throw new Error('Falha ao analisar a chave da conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL). Verifique o formato do JSON.');
    }
}


async function deidentifyText(text: string, projectId: string): Promise<string> {
    if (!text) return text;
    const credentials = await getServiceAccountCredentials();
    const dlp = new DlpServiceClient({ credentials });
    const location = 'global';

    const infoTypes = [
        { name: 'CPF_NUMBER' },
        { name: 'RG_NUMBER' },
        { name: 'PHONE_NUMBER' },
        { name: 'EMAIL_ADDRESS' },
        { name: 'BRAZIL_CNPJ_NUMBER' },
        { name: 'CREDIT_CARD_NUMBER' },
    ];

    const deidentifyConfig = {
        infoTypeTransformations: {
            transformations: [
                {
                    primitiveTransformation: {
                        replaceWithInfoTypeConfig: {},
                    },
                },
            ],
        },
    };

    const inspectConfig = {
        infoTypes: infoTypes,
    };
    
    const request = {
        parent: `projects/${projectId}/locations/${location}`,
        deidentifyConfig: deidentifyConfig,
        inspectConfig: inspectConfig,
        item: { value: text },
    };

    try {
        const [response] = await dlp.deidentifyContent(request);
        const deidentifiedItem = response.item;
        return deidentifiedItem?.value || text;
    } catch (error) {
        console.error('Error calling DLP API for text:', error);
        return text;
    }
}


function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

async function getFileContent(fileDataUri: string): Promise<string> {
    const [header, base64Data] = fileDataUri.split(',');
    if (!header || !base64Data) {
        throw new Error('Formato inválido de Data URI.');
    }
    const mimeType = header.match(/:(.*?);/)?.[1];
    const fileBuffer = Buffer.from(base64Data, 'base64');

    if (mimeType === 'application/pdf') {
        const data = await pdfParse(fileBuffer);
        return data.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
        return value;
    } else if (
        mimeType === 'application/vnd.ms-excel' || 
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        let fullText = '';
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_csv(worksheet, { header: 1 });
            fullText += `Planilha: ${sheetName}\n${sheetData}\n\n`;
        });
        return fullText;
    } else if (mimeType?.startsWith('text/')) {
        return fileBuffer.toString('utf-8');
    }

    throw new Error(`Tipo de arquivo não suportado: ${mimeType}. Por favor, envie um DOCX, PDF, XLS, XLSX ou arquivo de texto.`);
}


async function callDiscoveryEngine(
    query: string,
    attachments: AttachedFile[],
    userId?: string | null,
    // Este é um placeholder para a futura funcionalidade de drive pessoal.
    // Em uma implementação real, esta função obteria o ID da pasta do Drive do usuário.
    userDriveFolderId?: string | null
): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number; }> {
    const serviceAccountCredentials = await getServiceAccountCredentials();
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
      
      const deidentifiedQuery = await deidentifyText(query, projectId);
      
      let modelPrompt = ASSISTENTE_CORPORATIVO_PREAMBLE;

      if (attachments.length > 0) {
          const combinedFileContent = attachments.map(file => 
              `--- CONTEÚDO DO ARQUIVO: ${file.fileName} ---\n${file.deidentifiedContent}`
          ).join('\n\n');
          
          modelPrompt = `${ASSISTENTE_CORPORATIVO_PREAMBLE}\n\n## CONTEXTO FORNECIDO PELO USUÁRIO (ARQUIVOS ANEXADOS)\nA seguir, o conteúdo de um ou mais arquivos fornecidos pelo usuário. Use-os como contexto PRIMÁRIO para responder à pergunta.\n---\n${combinedFileContent}\n---`;
      }

      const requestBody: any = {
        query: deidentifiedQuery, 
        pageSize: 5,
        queryExpansionSpec: { condition: 'AUTO' },
        spellCorrectionSpec: { mode: 'AUTO' },
        languageCode: 'pt-BR',
        params: {},
        contentSearchSpec: {
            summarySpec: {
              summaryResultCount: 5,
              ignoreAdversarialQuery: true,
              useSemanticChunks: true,
              modelPromptSpec: {
                preamble: modelPrompt
              }
            }
        },
        userPseudoId: userId || 'anonymous-user',
      };

      // **MECANISMO DE SEGURANÇA PARA DRIVE PESSOAL**
      // Se um ID de pasta do drive for fornecido, adicionamos um filtro estrito.
      // Isso garante que a busca só acontecerá nos arquivos daquele usuário.
      if (userDriveFolderId) {
        requestBody.params.filter = `uri: INCLUDES("${userDriveFolderId}")}`;
      }

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
      const promptForTokenCount = modelPrompt + deidentifiedQuery;
      const promptTokenCount = estimateTokens(promptForTokenCount);
      const failureMessage = "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?";
      
      if (!data.summary || !data.summary.summaryText || !data.results || data.results.length === 0) {
          const candidatesTokenCount = estimateTokens(failureMessage);
          return { 
              summary: failureMessage, 
              searchFailed: true,
              promptTokenCount,
              candidatesTokenCount,
          };
      }

      const summary = data.summary.summaryText;
      const searchFailed = summary.trim() === failureMessage.trim();

      if (searchFailed) {
        const candidatesTokenCount = estimateTokens(summary);
        return { 
          summary, 
          searchFailed: true,
          promptTokenCount,
          candidatesTokenCount,
        };
      }

      const candidatesTokenCount = estimateTokens(summary);
      return { summary, searchFailed: false, promptTokenCount, candidatesTokenCount };

    } catch (error: any) {
      console.error("Error in callDiscoveryEngine:", error.message);
      if (error.message.includes('Could not refresh access token') || error.message.includes('permission')) {
         throw new Error(`Erro de permissão. Verifique no IAM se a conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL) tem o papel "Usuário do Discovery Engine".`);
      }
      throw new Error(`Ocorreu um erro ao se comunicar com o Discovery Engine: ${error.message}`);
    }
}


async function callGemini(query: string): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number }> {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('A variável de ambiente GEMINI_API_KEY não está definida.');
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
        const promptTokenCount = response.usageMetadata?.promptTokenCount;
        const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount;

        return { summary: text, searchFailed: false, promptTokenCount, candidatesTokenCount };

    } catch (error: any) {
        console.error("Error calling Gemini API:", error);
        if (error.message.includes('API key not valid')) {
            throw new Error(`Erro de autenticação com a API Gemini. Verifique se a GEMINI_API_KEY é válida.`);
        }
        throw new Error(`Ocorreu um erro ao se comunicar com o Gemini: ${error.message}`);
    }
}


export async function askAssistant(
  query: string,
  options: {
    useWebSearch?: boolean;
    fileDataUris?: { name: string; dataUri: string, mimeType: string }[];
    existingAttachments?: AttachedFile[];
  } = {},
  userId?: string | null
): Promise<{
  summary: string;
  searchFailed: boolean;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  updatedAttachments: AttachedFile[];
}> {
  const { useWebSearch = false, fileDataUris = [], existingAttachments = [] } = options;
  const serviceAccountCredentials = await getServiceAccountCredentials();
  const projectId = serviceAccountCredentials.project_id;


  try {
    if (useWebSearch) {
      // Web search does not support file uploads in this implementation
      const result = await callGemini(query);
      return { ...result, updatedAttachments: existingAttachments };
    } else {
        const newAttachments: AttachedFile[] = await Promise.all(
            (fileDataUris).map(async (file) => {
                const content = await getFileContent(file.dataUri);
                const deidentifiedContent = await deidentifyText(content, projectId);
                return {
                    id: crypto.randomUUID(),
                    fileName: file.name,
                    deidentifiedContent: deidentifiedContent,
                };
            })
        );
        
        const allAttachments = [...existingAttachments, ...newAttachments];
        
        const { summary, searchFailed, promptTokenCount, candidatesTokenCount } = await callDiscoveryEngine(query, allAttachments, userId);
        
        return {
            summary,
            searchFailed,
            promptTokenCount,
            candidatesTokenCount,
            updatedAttachments: allAttachments
        };
    }
  } catch (error: any) {
    console.error("Error in askAssistant:", error.message);
    throw new Error(`Ocorreu um erro ao se comunicar com o assistente: ${error.message}`);
  }
}

function convertAudioToMp3(inputBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const readableStream = new Readable();
        readableStream.push(inputBuffer);
        readableStream.push(null);

        const chunks: Buffer[] = [];
        ffmpeg(readableStream)
            .toFormat('mp3')
            .on('error', (err) => {
                reject(new Error(`Erro ao converter áudio com FFmpeg: ${err.message}`));
            })
            .on('end', () => {
                resolve(Buffer.concat(chunks));
            })
            .pipe()
            .on('data', (chunk) => {
                chunks.push(chunk);
            });
    });
}


export async function transcribeFileAudio(audioData: { dataUri: string; mimeType: string }): Promise<string> {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        
        let audioBuffer = Buffer.from(audioData.dataUri.split(',')[1], 'base64');
        let finalMimeType = audioData.mimeType;

        if (!['audio/mpeg', 'audio/wav', 'audio/mp3'].includes(audioData.mimeType)) {
             try {
                audioBuffer = await convertAudioToMp3(audioBuffer);
                finalMimeType = 'audio/mp3';
            } catch (conversionError) {
                console.error(conversionError);
                throw new Error("Falha ao converter o formato do áudio. Por favor, tente um formato diferente como MP3 ou WAV. Detalhes: " + (conversionError as Error).message);
            }
        }
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

        const audioFilePart = {
            inlineData: {
                data: audioBuffer.toString('base64'),
                mimeType: finalMimeType,
            }
        };
        
        const prompt = "Transcreva o seguinte áudio em português do Brasil. Retorne apenas o texto transcrito, sem nenhum outro comentário ou formatação.";
        
        const result = await model.generateContent([prompt, audioFilePart]);
        const response = await result.response;
        const transcription = response.text();

        return transcription || "Não foi possível transcrever o áudio.";

    } catch (error: any) {
        console.error("Detailed Speech-to-Text Error:", JSON.stringify(error, null, 2));
         if (error.response?.candidates?.[0]?.finishReason === 'SAFETY') {
            throw new Error('A transcrição foi bloqueada por políticas de segurança do modelo.');
        }
        if (error.message.includes('Could not find model')) {
           throw new Error(`O modelo de IA não foi encontrado. Verifique se o nome do modelo está correto.`);
        }
        if (error.message.includes('PERMISSION_DENIED')) {
            throw new Error('Erro de permissão. Verifique se a conta de serviço tem acesso à API Gemini.');
        }
        throw new Error(`Ocorreu um erro inesperado durante a transcrição: ${error.message}`);
    }
}

export async function transcribeLiveAudio(audioBase64: string): Promise<string> {
    try {
        const credentials = await getServiceAccountCredentials();
        const speechClient = new SpeechClient({ credentials });

        const audio = {
            content: audioBase64,
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

        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            ?.map(result => result.alternatives?.[0].transcript)
            .join('\n');
            
        return transcription || "Não foi possível transcrever o áudio.";
    } catch (error: any) {
        console.error("Error calling Google Speech-to-Text API:", error);
        if (error.code === 7 && error.details?.includes('requires billing')) {
          throw new Error('A API Speech-to-Text não está ativada ou a fatura não está configurada para este projeto.');
        }
        if (error.code === 3) {
            throw new Error(`Formato de áudio inválido. Detalhes: ${error.details}`);
        }
        throw new Error(`Ocorreu um erro inesperado durante a transcrição com a API Speech-to-Text: ${error.message}`);
    }
}


export async function regenerateAnswer(
  originalQuery: string,
  attachments: AttachedFile[],
  userId?: string | null
): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number }> {
  try {
    const { summary, searchFailed, promptTokenCount, candidatesTokenCount } = await callDiscoveryEngine(originalQuery, attachments, userId);
    return { summary, searchFailed, promptTokenCount, candidatesTokenCount };
  } catch (error: any) {
    console.error("Error in regenerateAnswer (internal):", error.message);
    throw new Error(`Ocorreu um erro ao se comunicar com o assistente para regenerar a resposta: ${error.message}`);
  }
}


export async function generateSuggestedQuestions(
  query: string,
  answer: string
): Promise<string[]> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error(
      'A variável de ambiente GEMINI_API_KEY não está definida.'
    );
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
  const baseQuery = fileName ? `${query} (analisando ${fileName})` : query;
  const fallbackTitle = baseQuery.length > 30 ? baseQuery.substring(0, 27) + '...' : baseQuery;
  
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('GEMINI_API_KEY não definida, usando título de fallback.');
    return fallbackTitle;
  }

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


export async function logDlpAlert(
  userId: string,
  chatId: string,
  originalQuery: string,
  findings: any[]
) {
  if (!userId || !findings || findings.length === 0) {
    return;
  }
  try {
    const alertRef = collection(db, 'dlp_alerts');
    await addDoc(alertRef, {
      userId,
      chatId,
      originalQuery, // NOTE: This stores the original query for audit purposes. Consider security implications.
      findings: findings.map((f) => ({
        infoType: f.infoType?.name || 'Desconhecido',
        likelihood: f.likelihood || 'Desconhecido',
        quote: f.quote || 'N/A',
      })),
      detectedAt: serverTimestamp(),
      status: 'new',
    });
  } catch (error) {
    console.error('Error logging DLP alert to Firestore:', error);
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
        const chatRef = doc(db, 'users', userId, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) {
            throw new Error("Conversation not found.");
        }

        const chatData = chatSnap.data();
        const existingFiles: AttachedFile[] = chatData.attachedFiles || [];

        const updatedFiles = existingFiles.filter(file => file.id !== fileId);

        await updateDoc(chatRef, {
            attachedFiles: updatedFiles,
        });

        return updatedFiles;
    } catch (error: any) {
        console.error("Error removing file from conversation:", error);
        throw new Error(`Failed to remove file from conversation: ${error.message}`);
    }
}
