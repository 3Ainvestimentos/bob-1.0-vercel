// src/app/admin/lib/admin_metrics.ts

import { getAuthenticatedFirestoreAdmin, getAuthenticatedAuthAdmin} from '@/lib/server/firebase';
import { Message, UserRole } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';


// --- Funções Auxiliares ---

function calculateAverage(arr: number[]): number {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function calculatePercentile(arr: number[], percentile: number): number {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const index = (percentile / 100) * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return arr[lower];
    return arr[lower] + (index - lower) * (arr[upper] - arr[lower]);
}


// --- Serviço Principal de Métricas ---

export async function calculateAdminMetrics(roleFilter: UserRole | 'all' = 'all') {
    const adminDb = await getAuthenticatedFirestoreAdmin();

    // --- Buscando Dados Brutos ---
    const listUsersResult = await (await getAuthenticatedAuthAdmin()).listUsers();
    const totalUsers = listUsersResult.users.length;
    
    const usersSnapshot = await adminDb.collection('users').get();
    const userRoles = new Map<string, UserRole>();
    usersSnapshot.forEach(doc => {
        userRoles.set(doc.id, doc.data().role || 'user');
    });

    // ⚠️ ALERTA DE PERFORMANCE E CUSTO CRÍTICO ⚠️
    // A linha abaixo lê TODOS os documentos de chat em TODAS as execuções.
    // Isso não é escalável e se tornará lento e caro.
    // O próximo passo ideal é substituir esta lógica por uma leitura de dados pré-agregados
    // que são atualizados por um Cloud Function Trigger.
    const chatsCollectionGroup = adminDb.collectionGroup('chats');
    const chatsSnapshot = await chatsCollectionGroup.get();

    // --- Inicializando Contadores ---
    let totalQuestions = 0;
    let ragSearchCount = 0;
    let webSearchCount = 0;
    let ragSearchFailureCount = 0;

    const userQuestionCounts: { [key: string]: number } = {};
    const interactionsByDayMap: { [key: string]: number } = {};
    const interactionsByHourMap: { [key: string]: number } = {};
    const sourceUsageMap: { [key: string]: { title: string; uri: string; count: number } } = {};
    const failedRagQueries: { query: string, user: string, date: string }[] = [];

    const allLatencies: number[] = [];
    const ragLatencies: number[] = [];
    const webLatencies: number[] = [];
    const latencyByDayMap: { [key: string]: { totalLatency: number, count: number } } = {};

    
    // --- Processando os Dados ---
    chatsSnapshot.forEach(doc => {
        const userId = doc.ref.parent.parent?.id;
        if (!userId) return;
        
        const userRole = userRoles.get(userId) || 'user';
        if (roleFilter !== 'all' && userRole !== roleFilter) {
            return;
        }

        const messages = (doc.data().messages || []) as Message[];
        const chatCreatedAt = (doc.data().createdAt as Timestamp).toDate();
        
        messages.forEach((m: Message, index: number) => {
            // ⚠️ PONTO DE MELHORIA: LÓGICA DE TIMEZONE ⚠️
            // Esta lógica manual pode ser imprecisa. Recomenda-se usar uma biblioteca
            // como `date-fns-tz` para converter para 'America/Sao_Paulo' corretamente.
            const interactionDate = new Date(chatCreatedAt); // Usar data UTC original para evitar erros
            const dayKey = interactionDate.toISOString().split('T')[0];

            if (m.role === 'user') {
                totalQuestions++;
                userQuestionCounts[userId] = (userQuestionCounts[userId] || 0) + 1;
                interactionsByDayMap[dayKey] = (interactionsByDayMap[dayKey] || 0) + 1;
                const hourKey = interactionDate.getUTCHours().toString().padStart(2, '0') + ':00';
                interactionsByHourMap[hourKey] = (interactionsByHourMap[hourKey] || 0) + 1;
            }

            if (m.role === 'assistant') {
    
                // 1. Verificamos se a latência existe e é válida PRIMEIRO.
                if (m.latencyMs && m.latencyMs > 0) {
                    
                    // 2. Se a latência existir, executamos TODA a lógica que depende dela aqui dentro.
                    allLatencies.push(m.latencyMs);

                    const dayKey = interactionDate.toISOString().split('T')[0];
                    if (!latencyByDayMap[dayKey]) {
                        latencyByDayMap[dayKey] = { totalLatency: 0, count: 0 };
                    }
                    latencyByDayMap[dayKey].totalLatency += m.latencyMs; // Sem erro aqui
                    latencyByDayMap[dayKey].count++;
                }


                if (m.source === 'web') {
                    webSearchCount++;
                    if (m.latencyMs) webLatencies.push(m.latencyMs);
                } else if (m.source === 'rag') {
                    ragSearchCount++;
                    if (m.latencyMs) ragLatencies.push(m.latencyMs);

                    // 🎯 PONTO DE MELHORIA: VERACIDADE DA MÉTRICA DE FALHA 🎯
                    // Esta contagem é imprecisa. Ela só mede uma falha explícita.
                    // A verdadeira taxa de falha deve ser medida com métricas de qualidade.
                    if (m.content === "Com base nos dados internos não consigo realizar essa resposta. Clique no item abaixo caso deseje procurar na web") {
                        ragSearchFailureCount++;
                        if (index > 0 && messages[index - 1].role === 'user') {
                            failedRagQueries.push({
                                query: messages[index - 1].content,
                                user: userRoles.get(userId) || userId,
                                date: interactionDate.toISOString()
                            });
                        }
                    }

                    if (m.sources) {
                        m.sources.forEach(source => {
                           if (!sourceUsageMap[source.uri]) {
                               sourceUsageMap[source.uri] = { title: source.title, uri: source.uri, count: 0 };
                           }
                           sourceUsageMap[source.uri].count++;
                        });
                    }
                }
            }
        });
    });

    // --- Cálculos Finais ---
    const usersWhoChattedCount = Object.keys(userQuestionCounts).length;
    const questionsPerUser = usersWhoChattedCount > 0 ? totalQuestions / usersWhoChattedCount : 0;
    const usersWithMoreThanOneQuestion = Object.values(userQuestionCounts).filter(count => count > 1).length;
    const engagementRate = totalUsers > 0 ? (usersWithMoreThanOneQuestion / totalUsers) * 100 : 0;    
    const totalSearches = ragSearchCount + webSearchCount;
    const webSearchRate = totalSearches > 0 ? (webSearchCount / totalSearches) * 100 : 0;
    const ragSearchFailureRate = ragSearchCount > 0 ? (ragSearchFailureCount / ragSearchCount) * 100 : 0;

    const mostUsedSources = Object.values(sourceUsageMap).sort((a, b) => b.count - a.count).slice(0, 10);
    const interactionsByDay = Object.entries(interactionsByDayMap).map(([date, count]) => ({ date, formattedDate: date.split('-').reverse().join('/'), count })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const interactionsByHour = Object.entries(interactionsByHourMap).map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour.localeCompare(b.hour));
    // ADICIONE ESTA LINHA:
    const latencyByDay = Object.entries(latencyByDayMap)
        .map(([date, data]) => ({
            date,
            formattedDate: date.split('-').reverse().join('/'),
            latency: data.count > 0 ? data.totalLatency / data.count : 0,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());


    // --- LÓGICA DAS PERGUNTAS FREQUENTES (ADICIONADA AQUI) ---
    console.log("--- Depurando Perguntas Frequentes ---");
    let topQuestions: any[] = [];
    try {
        const analyticsCollection = adminDb.collection('question_analytics');
        const topQuestionsSnapshot = await analyticsCollection.orderBy('count', 'desc').limit(10).get();

        // LOG 1: Vamos ver quantos documentos a consulta encontrou.
        //console.log(`A consulta encontrou ${topQuestionsSnapshot.size} documentos.`);

        //if (topQuestionsSnapshot.empty) {
            // console.log("A coleção 'question_analytics' foi consultada, mas retornou vazia.");
        //} else {
             // LOG 2: Vamos imprimir os dados brutos de um dos documentos.
          //  console.log("Dados brutos do primeiro documento:", topQuestionsSnapshot.docs[0].data());
        //}

        topQuestions = topQuestionsSnapshot.docs.map(doc => {
            const data = doc.data();
            const lastAsked = data.lastAsked as Timestamp;
            return {
                ...data,
                lastAsked: lastAsked ? lastAsked.toDate().toLocaleString('pt-BR') : 'Data inválida',
            };
        });

         //LOG 3: Vamos ver o array final.
        // console.log("Array 'topQuestions' final:", topQuestions);
    } catch(err: any) {
        console.error("ERRO ao buscar 'question_analytics':", err.message);
         //Se a busca falhar (ex: por falta de índice), o array 'topQuestions' continuará vazio.
    }
    //console.log("--------------------------------------");
    
    // Supondo que você tenha outras coleções para estes dados
    const regenerationsSnapshot = await adminDb.collectionGroup('regenerated_answers').get();
    const totalRegenerations = regenerationsSnapshot.size;

    return { 
        totalQuestions, totalUsers, questionsPerUser, engagementRate, totalRegenerations,
        webSearchCount, ragSearchCount, ragSearchFailureCount, ragSearchFailureRate, webSearchRate,
        mostUsedSources, failedRagQueries, interactionsByDay, interactionsByHour,
        avgLatency: calculateAverage(allLatencies),
        avgLatencyRag: calculateAverage(ragLatencies),
        avgLatencyWeb: calculateAverage(webLatencies),
        p95Latency: calculatePercentile(allLatencies, 95),
        p99Latency: calculatePercentile(allLatencies, 99),
        topQuestions, // <<<--- variável adicionada ao objeto de retorno
        latencyByDay,
    };
}

// ADICIONE ESTA NOVA FUNÇÃO ABAIXO:
export async function getAdminCostsFromService(): Promise<any> {
    try {
        // Simula uma chamada de API
        await new Promise(resolve => setTimeout(resolve, 500)); 
        
        // NOTA: Esta é a camada de serviço. É aqui que você implementaria
        // a lógica real de busca dos custos no BigQuery, como planejado
        // no seu projeto "billing dashboard".
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
    } catch (error: any) {
        console.error("Error fetching admin costs from service:", error);
        // Lança o erro para a action capturar
        throw new Error(`Não foi possível carregar os dados de custo: ${error.message}`);
    }
}