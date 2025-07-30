
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { getAdminInsights, getAdminUsers, getAdminCosts, getMaintenanceMode, setMaintenanceMode, runApiHealthCheck, getLegalIssueAlerts } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCircle, Users, ArrowLeft, MessageCircleQuestion, Shield, ThumbsUp, ThumbsDown, BarChart2, Repeat, Globe, UserCheck, Percent, LineChart, DollarSign, Coins, TrendingUp, PiggyBank, AlertTriangle, Database, FileSearch, Link as LinkIcon, BookOpenCheck, SearchX, Timer, Gauge, Rabbit, Turtle, Wrench, Beaker, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ADMIN_UID } from '@/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


interface AdminInsights {
    totalQuestions: number;
    totalUsers: number;
    questionsPerUser: number;
    engagementRate: number;
    totalRegenerations: number;
    webSearchCount: number;
    ragSearchCount: number;
    ragSearchFailureCount: number;
    ragSearchFailureRate: number;
    webSearchRate: number;
    topQuestions: any[];
    positiveFeedbacks: number;
    negativeFeedbacks: number;
    interactionsByDay: { date: string, formattedDate: string, count: number }[];
    interactionsByHour: { hour: string, count: number }[];
    latencyByDay: { date: string, formattedDate: string, latency: number }[];
    totalLegalIssues: number;
    mostUsedSources: { title: string, uri: string, count: number }[];
    avgLatency: number;
    avgLatencyRag: number;
    avgLatencyWeb: number;
    p95Latency: number;
    p99Latency: number;
}

interface AdminUser {
    uid: string;
    email?: string;
    displayName?: string;
}

interface AdminCosts {
    currentMonthCost: number;
    costPerMillionInputTokens: number;
    costPerMillionOutputTokens: number;
    monthlyCostForecast: number;
    costByService: { service: string; cost: number }[];
}

interface ApiHealthResult {
    api: string;
    status: 'OK' | 'Erro';
    latency: number;
    error?: string;
}

interface LegalIssueAlert {
    id: string;
    user: { email?: string; displayName?: string };
    reportedAt: string;
    userQuery: string;
    assistantResponse: string;
    comment?: string;
}


export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [insights, setInsights] = useState<AdminInsights | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [costs, setCosts] = useState<AdminCosts | null>(null);
  const [legalAlerts, setLegalAlerts] = useState<LegalIssueAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  
  const [apiHealthResults, setApiHealthResults] = useState<ApiHealthResult[]>([]);
  const [isCheckingApiHealth, setIsCheckingApiHealth] = useState(false);


  useEffect(() => {
    if (authLoading) {
      return; 
    }

    if (!user) {
      router.push('/');
      return;
    }
    
    if (user.uid === ADMIN_UID) {
        setIsAuthorized(true);
        Promise.all([
            getAdminInsights(),
            getAdminUsers(),
            getAdminCosts(),
            getMaintenanceMode(),
            getLegalIssueAlerts(),
        ]).then(([insightsData, usersData, costsData, maintenanceData, alertsData]) => {
            if (insightsData.error) throw new Error(insightsData.error);
            if (usersData.error) throw new Error(usersData.error);
            if (costsData.error) throw new Error(costsData.error);
            if (maintenanceData.error) throw new Error(maintenanceData.error);
            if (alertsData.error) throw new Error(alertsData.error);

            setInsights(insightsData);
            setAdminUsers(usersData);
            setCosts(costsData);
            setIsMaintenanceMode(maintenanceData.isMaintenanceMode);
            setLegalAlerts(alertsData);
        }).catch(err => {
            console.error('Erro ao buscar dados do painel:', err);
            setError(err.message || 'Não foi possível carregar os dados do painel.');
        }).finally(() => {
            setIsLoading(false);
        });
    } else {
        setIsAuthorized(false);
        setError("Você não tem permissão para ver esta página.");
        setIsLoading(false);
    }
      
  }, [user, authLoading, router]);

  const handleMaintenanceModeToggle = async (checked: boolean) => {
    setIsMaintenanceMode(checked);
    try {
        const result = await setMaintenanceMode(checked);
        if (result.error) {
            throw new Error(result.error);
        }
        toast({
            title: "Modo de Manutenção Atualizado",
            description: `O sistema está agora ${checked ? 'em manutenção' : 'operacional para todos os usuários'}.`,
        });
    } catch (error: any) {
        console.error("Erro ao atualizar modo de manutenção:", error);
        toast({
            variant: "destructive",
            title: "Erro",
            description: `Não foi possível atualizar o modo de manutenção: ${error.message}`,
        });
        // Revert UI on error
        setIsMaintenanceMode(!checked);
    }
  };

  const handleRunApiHealthCheck = async () => {
    setIsCheckingApiHealth(true);
    setApiHealthResults([]);
    try {
        const result = await runApiHealthCheck();
        if (result.error) {
            throw new Error(result.error);
        }
        setApiHealthResults(result.results);
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Erro no Diagnóstico",
            description: `Não foi possível executar o teste de API: ${error.message}`,
        });
    } finally {
        setIsCheckingApiHealth(false);
    }
  };


  const formatLatency = (ms: number) => {
    if (ms === 0) return 'N/A';
    return (ms / 1000).toFixed(2) + 's';
  }
  
  const formatLatencyForChart = (ms: number) => {
    if (ms === 0) return 0;
    return parseFloat((ms / 1000).toFixed(2));
  }
  
  const latencyComparisonChartData = insights ? [
    { name: 'Geral', latency: formatLatencyForChart(insights.avgLatency), fill: 'hsl(var(--chart-1))' },
    { name: 'RAG', latency: formatLatencyForChart(insights.avgLatencyRag), fill: 'hsl(var(--primary))' },
    { name: 'Web', latency: formatLatencyForChart(insights.avgLatencyWeb), fill: 'hsl(var(--destructive))' },
  ] : [];

  const latencyByDayChartData = insights ? insights.latencyByDay.map(d => ({
      ...d,
      latency: formatLatencyForChart(d.latency)
  })) : [];

  if (authLoading || isLoading) {
    return (
      <div className="dark flex h-screen w-full items-center justify-center bg-background">
        <p className="text-lg text-muted-foreground">Carregando painel...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="dark flex h-screen w-full flex-col items-center justify-center bg-background text-center">
        <h1 className="text-2xl font-bold text-destructive">Acesso Negado</h1>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => router.push('/chat')} className="mt-4">
          Voltar ao Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="dark flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 md:grid md:grid-cols-3">
        <div className="flex items-center">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => router.push('/chat')}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Voltar ao Chat</span>
          </Button>
        </div>
        <div className="flex items-center justify-center">
            <h1 className="text-2xl font-bold text-center">Painel Administrativo</h1>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
        {error && insights === null && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-center text-sm text-destructive">
                {error}
            </div>
        )}
        <Tabs defaultValue="analytics" className="w-full">
            <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="analytics">Análise Geral</TabsTrigger>
                <TabsTrigger value="rag">Análise RAG</TabsTrigger>
                <TabsTrigger value="latency">Latência</TabsTrigger>
                <TabsTrigger value="feedback">Feedbacks</TabsTrigger>
                <TabsTrigger value="legal">Alertas Jurídicos</TabsTrigger>
                <TabsTrigger value="costs">Custos</TabsTrigger>
                <TabsTrigger value="system">Sistema</TabsTrigger>
            </TabsList>
            <TabsContent value="analytics" className="mt-4">
                <div className="flex flex-1 flex-col gap-4 md:gap-8">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-8">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total de Perguntas</CardTitle>
                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {insights?.totalQuestions.toLocaleString() ?? '...'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Total de perguntas de usuários registradas.
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {insights?.totalUsers.toLocaleString() ?? '...'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Total de usuários únicos que interagiram.
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Perguntas/Usuário</CardTitle>
                                <BarChart2 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {Math.round(insights?.questionsPerUser ?? 0)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Média de perguntas por usuário.
                                </p>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Taxa de Engajamento</CardTitle>
                                <UserCheck className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {insights?.engagementRate.toFixed(1) ?? '...'}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    % de usuários com mais de uma pergunta.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                     <div className="grid gap-4 md:grid-cols-1 md:gap-8">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <LineChart className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Interações ao Longo do Tempo</CardTitle>
                                </div>
                                <CardDescription>
                                    Visualização do número de perguntas feitas por dia ou por hora.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="daily">
                                    <TabsList>
                                        <TabsTrigger value="daily">Por Dia</TabsTrigger>
                                        <TabsTrigger value="hourly">Por Hora</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="daily" className="pt-4">
                                         <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={insights?.interactionsByDay}>
                                                <XAxis dataKey="formattedDate" stroke="#888888" fontSize={12} tickLine={false} axisLine={false}/>
                                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "hsl(var(--background))",
                                                        borderColor: "hsl(var(--border))"
                                                    }}
                                                />
                                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Perguntas" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </TabsContent>
                                    <TabsContent value="hourly" className="pt-4">
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={insights?.interactionsByHour}>
                                                <XAxis dataKey="hour" stroke="#888888" fontSize={12} tickLine={false} axisLine={false}/>
                                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                                 <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "hsl(var(--background))",
                                                        borderColor: "hsl(var(--border))"
                                                    }}
                                                />
                                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Perguntas" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                        <Card className="col-span-1">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <MessageCircleQuestion className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Perguntas Mais Frequentes</CardTitle>
                                </div>
                                <CardDescription>
                                    As 10 perguntas mais realizadas pelos usuários.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[60%]">Pergunta</TableHead>
                                            <TableHead>Contagem</TableHead>
                                            <TableHead className="text-right">Última Vez</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {insights?.topQuestions && insights.topQuestions.length > 0 ? (
                                            insights.topQuestions.map((q, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">{q.normalizedText}</TableCell>
                                                <TableCell>{q.count}</TableCell>
                                                <TableCell className="text-right">{q.lastAsked}</TableCell>
                                            </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="h-24 text-center">
                                                    Nenhum dado de pergunta frequente encontrado.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                        <Card className="col-span-1">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Todos os Usuários</CardTitle>
                                </div>
                                <CardDescription>
                                    Lista de todos os usuários registrados no sistema.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-80 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Nome</TableHead>
                                                <TableHead>Email</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {adminUsers.length > 0 ? (
                                                adminUsers.map((admin) => (
                                                    <TableRow key={admin.uid}>
                                                        <TableCell className="font-medium">{admin.displayName ?? 'N/A'}</TableCell>
                                                        <TableCell>{admin.email ?? 'N/A'}</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={2} className="h-24 text-center">
                                                        Nenhum usuário encontrado.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </TabsContent>
             <TabsContent value="rag" className="mt-4">
                <div className="flex flex-1 flex-col gap-4 md:gap-8">
                     <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-8">
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total de Buscas RAG</CardTitle>
                                <Database className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {insights?.ragSearchCount.toLocaleString() ?? '...'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Buscas na base de conhecimento interna.
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total de Buscas Web</CardTitle>
                                <Globe className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {insights?.webSearchCount.toLocaleString() ?? '...'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                   Total de buscas na web.
                                </p>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Falhas na Busca Interna</CardTitle>
                                <SearchX className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {insights?.ragSearchFailureRate.toFixed(1) ?? '...'}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    De {insights?.ragSearchCount} buscas, {insights?.ragSearchFailureCount} não acharam resposta.
                                </p>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Taxa de Busca Web</CardTitle>
                                <Percent className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {insights?.webSearchRate.toFixed(1) ?? '...'}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    De {insights?.ragSearchCount ?? 0} RAG vs. {insights?.webSearchCount ?? 0} Web.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="grid gap-4 md:grid-cols-1 md:gap-8">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <BookOpenCheck className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Documentos Mais Utilizados</CardTitle>
                                </div>
                                <CardDescription>
                                    As 10 fontes de dados mais usadas pela IA para gerar respostas.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[80%]">Título do Documento</TableHead>
                                            <TableHead className="text-right">Consultas</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {insights?.mostUsedSources && insights.mostUsedSources.length > 0 ? (
                                            insights.mostUsedSources.map((source, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">
                                                    <a href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                                                        {source.title}
                                                        <LinkIcon className="h-3 w-3 shrink-0" />
                                                    </a>
                                                </TableCell>
                                                <TableCell className="text-right">{source.count}</TableCell>
                                            </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="h-24 text-center">
                                                    Nenhum dado de fonte RAG encontrado.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </TabsContent>
            <TabsContent value="latency" className="mt-4">
                <div className="grid gap-4 md:gap-8">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-8">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Latência Média (Geral)</CardTitle>
                                <Timer className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {formatLatency(insights?.avgLatency ?? 0)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Tempo médio de resposta para todas as buscas.
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Latência Média (RAG)</CardTitle>
                                <Database className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {formatLatency(insights?.avgLatencyRag ?? 0)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Tempo médio de resposta para buscas internas.
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Latência Média (Web)</CardTitle>
                                <Globe className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {formatLatency(insights?.avgLatencyWeb ?? 0)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Tempo médio de resposta para buscas na web.
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Latência P95 / P99</CardTitle>
                                <Gauge className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4">
                                    <div>
                                        <div className="text-lg font-bold flex items-center gap-1">
                                            <Rabbit className="h-4 w-4 text-green-500" /> {formatLatency(insights?.p95Latency ?? 0)}
                                        </div>
                                        <p className="text-xs text-muted-foreground">95% das respostas</p>
                                    </div>
                                    <div>
                                        <div className="text-lg font-bold flex items-center gap-1">
                                            <Turtle className="h-4 w-4 text-orange-500" /> {formatLatency(insights?.p99Latency ?? 0)}
                                        </div>
                                        <p className="text-xs text-muted-foreground">99% das respostas</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                     <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <BarChart2 className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Comparativo de Latência por Tipo</CardTitle>
                                </div>
                                <CardDescription>
                                    Comparação visual da latência média por tipo de busca.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={latencyComparisonChartData}>
                                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}s`} />
                                        <Tooltip
                                            formatter={(value) => [`${value}s`, 'Latência Média']}
                                            cursor={{fill: 'hsl(var(--muted))'}}
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--background))",
                                                borderColor: "hsl(var(--border))"
                                            }}
                                        />
                                        <Bar dataKey="latency" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <LineChart className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Latência Média por Dia</CardTitle>
                                </div>
                                <CardDescription>
                                    Visualização da latência média das respostas ao longo do tempo.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={latencyByDayChartData}>
                                        <XAxis dataKey="formattedDate" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}s`} />
                                        <Tooltip
                                            formatter={(value) => [`${value}s`, 'Latência Média']}
                                            cursor={{fill: 'hsl(var(--muted))'}}
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--background))",
                                                borderColor: "hsl(var(--border))"
                                            }}
                                        />
                                        <Bar dataKey="latency" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Latência" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </TabsContent>
            <TabsContent value="feedback" className="mt-4">
                 <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Feedbacks</CardTitle>
                            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <ThumbsUp className="h-5 w-5 text-green-500" />
                                    <span className="text-2xl font-bold">{insights?.positiveFeedbacks.toLocaleString() ?? '...'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <ThumbsDown className="h-5 w-5 text-red-500" />
                                    <span className="text-2xl font-bold">{insights?.negativeFeedbacks.toLocaleString() ?? '...'}</span>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground pt-1">
                                Total de avaliações positivas e negativas.
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Respostas Regeneradas</CardTitle>
                            <Repeat className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {insights?.totalRegenerations.toLocaleString() ?? '...'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Total de vezes que a resposta foi regenerada.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>
            <TabsContent value="legal" className="mt-4">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Alertas Jurídicos Reportados ({legalAlerts.length})</CardTitle>
                        </div>
                        <CardDescription>
                            Análise detalhada de todos os problemas jurídicos reportados pelos usuários.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {legalAlerts.length > 0 ? (
                            <Accordion type="single" collapsible className="w-full">
                                {legalAlerts.map(alert => (
                                    <AccordionItem value={alert.id} key={alert.id}>
                                        <AccordionTrigger>
                                            <div className="flex w-full items-center justify-between pr-4 text-sm">
                                                <div className='text-left'>
                                                    <p className='font-semibold'>{alert.user.displayName || alert.user.email}</p>
                                                    <p className='text-xs text-muted-foreground'>{alert.user.email}</p>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{alert.reportedAt}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="space-y-4 rounded-md border bg-muted/50 p-4">
                                                <div>
                                                    <h4 className="font-semibold text-xs uppercase text-muted-foreground">Consulta do Usuário</h4>
                                                    <p className="mt-1 text-sm">{alert.userQuery}</p>
                                                </div>
                                                <div className='h-px bg-border'></div>
                                                <div>
                                                    <h4 className="font-semibold text-xs uppercase text-muted-foreground">Resposta da IA</h4>
                                                    <p className="mt-1 text-sm">{alert.assistantResponse}</p>
                                                </div>
                                                {alert.comment && (
                                                     <>
                                                        <div className='h-px bg-border'></div>
                                                        <div>
                                                            <h4 className="font-semibold text-xs uppercase text-muted-foreground">Comentário do Usuário</h4>
                                                            <p className="mt-1 text-sm italic">"{alert.comment}"</p>
                                                        </div>
                                                     </>
                                                )}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        ) : (
                            <div className="text-center text-muted-foreground py-10">
                                Nenhum alerta jurídico reportado.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="costs" className="mt-4">
                <div className="flex flex-1 flex-col gap-4 md:gap-8">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-8">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Custo Total (Mês Atual)</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    R$ {costs?.currentMonthCost.toFixed(2).replace('.', ',') ?? '...'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Custo acumulado neste mês.
                                </p>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Previsão (Fim do Mês)</CardTitle>
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                     R$ {costs?.monthlyCostForecast.toFixed(2).replace('.', ',') ?? '...'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Custo projetado para o final do mês.
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Custo por Milhão de Tokens</CardTitle>
                                <Coins className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    Input: R$ {costs?.costPerMillionInputTokens.toFixed(2).replace('.', ',') ?? '...'}
                                </div>
                                <div className="text-lg font-bold">
                                    Output: R$ {costs?.costPerMillionOutputTokens.toFixed(2).replace('.', ',') ?? '...'}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                     <div className="grid gap-4 md:grid-cols-1 md:gap-8">
                         <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <PiggyBank className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Distribuição de Custos por Serviço</CardTitle>
                                </div>
                                <CardDescription>
                                    Visualização do custo por serviço da Google Cloud.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                 <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={costs?.costByService}>
                                        <XAxis dataKey="service" stroke="#888888" fontSize={12} tickLine={false} axisLine={false}/>
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                                        <Tooltip
                                            formatter={(value) => [`R$${(value as number).toFixed(2).replace('.', ',')}`, 'Custo']}
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--background))",
                                                borderColor: "hsl(var(--border))"
                                            }}
                                        />
                                        <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Custo" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                     </div>
                </div>
            </TabsContent>
            <TabsContent value="system" className="mt-4">
                <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                    <Card>
                        <CardHeader>
                             <div className="flex items-center gap-2">
                                <Wrench className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Configurações do Sistema</CardTitle>
                            </div>
                            <CardDescription>
                                Controles globais para o comportamento do aplicativo.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div>
                                    <Label htmlFor="maintenance-mode" className="font-semibold">Modo de Manutenção</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Quando ativado, apenas administradores podem logar.
                                    </p>
                                </div>
                                <Switch
                                    id="maintenance-mode"
                                    checked={isMaintenanceMode}
                                    onCheckedChange={handleMaintenanceModeToggle}
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Beaker className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Diagnóstico de APIs</CardTitle>
                            </div>
                            <CardDescription>
                                Verifique a saúde e a latência das APIs essenciais.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button onClick={handleRunApiHealthCheck} disabled={isCheckingApiHealth}>
                                {isCheckingApiHealth ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Beaker className="mr-2 h-4 w-4" />
                                )}
                                Executar Testes
                            </Button>
                            {apiHealthResults.length > 0 && (
                                <Table className="mt-4">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>API</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Latência</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {apiHealthResults.map((result) => (
                                            <TableRow key={result.api}>
                                                <TableCell className="font-medium">{result.api}</TableCell>
                                                <TableCell>
                                                    <div className={cn("flex items-center gap-2", result.status === 'OK' ? 'text-green-600' : 'text-destructive')}>
                                                        {result.status === 'OK' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                                        <span>{result.status}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{result.latency}ms</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
