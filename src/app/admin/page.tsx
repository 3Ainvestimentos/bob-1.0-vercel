'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { getAdminInsights, getUsersWithRoles, getAdminCosts, getMaintenanceMode, setMaintenanceMode, runApiHealthCheck, getLegalIssueAlerts, getFeedbacks, setUserRole, deleteUser, createUser, getPreRegisteredUsers, setUserOnboardingStatus } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCircle, Users, ArrowLeft, MessageCircleQuestion, Shield, ThumbsUp, ThumbsDown, BarChart2, Repeat, Globe, UserCheck, Percent, LineChart, DollarSign, Coins, TrendingUp, PiggyBank, AlertTriangle, Database, FileSearch, Link as LinkIcon, BookOpenCheck, SearchX, Timer, Gauge, Rabbit, Turtle, Wrench, Beaker, CheckCircle2, XCircle, Loader2, MessageSquare, Save, MoreHorizontal, Pencil, Trash2, UserPlus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { UserRole } from '@/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';


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
    failedRagQueries: { query: string, user: string, date: string }[];
}

interface AdminUser {
    uid: string;
    email?: string;
    displayName?: string;
    role: UserRole;
    createdAt: string;
    hasCompletedOnboarding: boolean;
}

interface PreRegisteredUser {
    email: string;
    role: UserRole;
    createdAt: string;
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

interface Feedback {
    id: string;
    user: { email?: string; displayName?: string };
    updatedAt: string;
    rating: 'positive' | 'negative';
    userQuery: string;
    assistantResponse: string;
    comment?: string;
}


export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [insights, setInsights] = useState<AdminInsights | null>(null);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [preRegisteredUsers, setPreRegisteredUsers] = useState<PreRegisteredUser[]>([]);
  const [costs, setCosts] = useState<AdminCosts | null>(null);
  const [legalAlerts, setLegalAlerts] = useState<LegalIssueAlert[]>([]);
  const [feedbacks, setFeedbacks] = useState<{positive: Feedback[], negative: Feedback[]}>({ positive: [], negative: [] });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  
  const [apiHealthResults, setApiHealthResults] = useState<ApiHealthResult[]>([]);
  const [isCheckingApiHealth, setIsCheckingApiHealth] = useState(false);
  
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [isDeleteUserDialogOpen, setIsDeleteUserDialogOpen] = useState(false);

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [newUser, setNewUser] = useState({ email: '', role: 'user' as UserRole });
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  
  const [interactionsRoleFilter, setInteractionsRoleFilter] = useState<UserRole | 'all'>('all');
  const [isFetchingInsights, setIsFetchingInsights] = useState(false);


  const filteredUsers = useMemo(() => {
    if (roleFilter === 'all') {
      return allUsers;
    }
    return allUsers.filter(user => user.role === roleFilter);
  }, [allUsers, roleFilter]);

  const fetchInsights = async (filter: UserRole | 'all') => {
        setIsFetchingInsights(true);
        try {
            const insightsData = await getAdminInsights(filter);
            if (insightsData.error) throw new Error(insightsData.error);
            setInsights(insightsData);
        } catch (err: any) {
            console.error('Erro ao buscar insights com filtro:', err);
            setError(err.message || 'Não foi possível carregar os insights com o filtro aplicado.');
        } finally {
            setIsFetchingInsights(false);
        }
    };
    
    const handleInteractionsFilterChange = (newFilter: UserRole | 'all') => {
        setInteractionsRoleFilter(newFilter);
        fetchInsights(newFilter);
    };

  const fetchAllAdminData = async () => {
    setIsLoading(true);
     try {
        const [insightsData, usersData, preRegData, costsData, maintenanceData, alertsData, feedbacksData] = await Promise.all([
            getAdminInsights('all'),
            getUsersWithRoles(),
            getPreRegisteredUsers(),
            getAdminCosts(),
            getMaintenanceMode(),
            getLegalIssueAlerts(),
            getFeedbacks(),
        ]);
        if (insightsData?.error) throw new Error(insightsData.error);
        if (usersData?.error) throw new Error(usersData.error);
        if (preRegData?.error) throw new Error(preRegData.error);
        if (costsData?.error) throw new Error(costsData.error);
        if (alertsData?.error) throw new Error(alertsData.error);
        if (feedbacksData?.error) throw new Error(feedbacksData.error);
        
        setInsights(insightsData);
        setAllUsers(usersData);
        setPreRegisteredUsers(preRegData);
        setCosts(costsData);
        setIsMaintenanceMode(maintenanceData.isMaintenanceMode);
        setLegalAlerts(alertsData);
        setFeedbacks(feedbacksData);
     } catch (err: any) {
        console.error('Erro ao buscar dados do painel:', err);
        setError(err.message || 'Não foi possível carregar os dados do painel.');
     } finally {
        setIsLoading(false);
     }
  };

  useEffect(() => {
    if (authLoading) {
      return; 
    }

    if (!user) {
      router.push('/');
      return;
    }
    
    const checkAuthorization = async () => {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists() && userDocSnap.data()?.role === 'admin') {
                setIsAuthorized(true);
                fetchAllAdminData();
            } else {
                setIsAuthorized(false);
                setError("Você não tem permissão para ver esta página.");
                setIsLoading(false);
            }
        } catch (err) {
            setIsAuthorized(false);
            setError("Ocorreu um erro ao verificar suas permissões.");
            setIsLoading(false);
        }
    };
    checkAuthorization();
      
  }, [user, authLoading, router]);

  const handleMaintenanceModeToggle = async (checked: boolean) => {
    setIsMaintenanceMode(checked);
    try {
        const result = await setMaintenanceMode(checked);
        if (result?.error) {
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

  const handleOpenEditUserDialog = (userToEdit: AdminUser) => {
    setSelectedUser(userToEdit);
    setIsEditUserDialogOpen(true);
  };

  const handleSaveUserRole = async () => {
    if (!selectedUser) return;
    const result = await setUserRole(selectedUser.uid, selectedUser.role);
    if (result.success) {
        toast({ title: 'Sucesso', description: `O papel de ${selectedUser.displayName} foi atualizado.` });
        await fetchAllAdminData();
    } else {
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
    }
    setIsEditUserDialogOpen(false);
    setSelectedUser(null);
  };
  
  const handleOpenDeleteUserDialog = (userToDelete: AdminUser) => {
    setSelectedUser(userToDelete);
    setIsDeleteUserDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    const result = await deleteUser(selectedUser.uid);
     if (result.success) {
        toast({ title: 'Sucesso', description: `O usuário ${selectedUser.displayName} foi excluído.` });
        await fetchAllAdminData();
    } else {
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
    }
    setIsDeleteUserDialogOpen(false);
    setSelectedUser(null);
  };

    const handleCreateUser = async () => {
        const { email, role } = newUser;
        if (!email.trim() || !role) {
            toast({ variant: 'destructive', title: 'Erro de Validação', description: 'Por favor, preencha o email e selecione um papel.' });
            return;
        }

        const result = await createUser(email, role);
        if (result.success) {
            toast({ title: 'Sucesso', description: `Usuário com email ${email} foi pré-registrado com sucesso.` });
            await fetchAllAdminData();
            setIsAddUserDialogOpen(false);
            setNewUser({ email: '', role: 'user' });
            // We don't need to refetch data as the user list won't change until they log in.
        } else {
            toast({ variant: 'destructive', title: 'Erro ao Pré-registrar', description: result.error });
        }
    };
    
    const handleOnboardingToggle = async (userId: string, newStatus: boolean) => {
        const result = await setUserOnboardingStatus(userId, newStatus);
        if (result.success) {
            setAllUsers(prevUsers => 
                prevUsers.map(u => u.uid === userId ? { ...u, hasCompletedOnboarding: newStatus } : u)
            );
            toast({ title: 'Sucesso', description: `Status do onboarding do usuário atualizado.` });
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
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

  const FeedbackAccordion = ({ feedbacks, type }: { feedbacks: Feedback[], type: 'positive' | 'negative' }) => (
    <>
        {feedbacks.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
                {feedbacks.map(feedback => (
                    <AccordionItem value={feedback.id} key={feedback.id}>
                        <AccordionTrigger>
                            <div className="flex w-full items-center justify-between pr-4 text-sm">
                                <div className='text-left'>
                                    <p className='font-semibold'>{feedback.user.displayName || feedback.user.email}</p>
                                    <p className='text-xs text-muted-foreground'>{feedback.user.email}</p>
                                </div>
                                <span className="text-xs text-muted-foreground">{feedback.updatedAt}</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="space-y-4 rounded-md border bg-muted/50 p-4">
                                <div>
                                    <h4 className="font-semibold text-xs uppercase text-muted-foreground">Consulta do Usuário</h4>
                                    <p className="mt-1 text-sm">{feedback.userQuery}</p>
                                </div>
                                <div className='h-px bg-border'></div>
                                <div>
                                    <h4 className="font-semibold text-xs uppercase text-muted-foreground">Resposta da IA</h4>
                                    <p className="mt-1 text-sm">{feedback.assistantResponse}</p>
                                </div>
                                {feedback.comment && (
                                     <>
                                        <div className='h-px bg-border'></div>
                                        <div>
                                            <h4 className="font-semibold text-xs uppercase text-muted-foreground">Comentário do Usuário</h4>
                                            <p className="mt-1 text-sm italic">"{feedback.comment}"</p>
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
                Nenhum feedback {type === 'positive' ? 'positivo' : 'negativo'} encontrado.
            </div>
        )}
    </>
  );
  
  const roleDisplay: Record<UserRole, { label: string, className: string }> = {
    admin: { label: 'Admin', className: 'bg-red-500 text-white' },
    beta: { label: 'Beta', className: 'bg-blue-500 text-white' },
    user: { label: 'Usuário', className: 'bg-gray-500 text-white' },
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-lg text-muted-foreground">Carregando painel...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-center">
        <h1 className="text-2xl font-bold text-destructive">Acesso Negado</h1>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => router.push('/chat')} className="mt-4">
          Voltar ao Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
       <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Papel do Usuário</DialogTitle>
                    <DialogDescription>
                        Altere o nível de acesso para {selectedUser?.displayName || selectedUser?.email}.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Select value={selectedUser?.role} onValueChange={(value) => setSelectedUser(prev => prev ? {...prev, role: value as UserRole} : null)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione um papel" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="user">Usuário</SelectItem>
                            <SelectItem value="beta">Beta</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditUserDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSaveUserRole}>Salvar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Pré-registrar Novo Usuário</DialogTitle>
                    <DialogDescription>
                        Insira o email e o papel inicial. O usuário completará o registro ao fazer login com o Google.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={newUser.email} onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))} placeholder="exemplo@3ariva.com.br" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="role">Papel</Label>
                        <Select value={newUser.role} onValueChange={(value) => setNewUser(prev => ({...prev, role: value as UserRole}))}>
                            <SelectTrigger id="role">
                                <SelectValue placeholder="Selecione um papel" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">Usuário</SelectItem>
                                <SelectItem value="beta">Beta</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleCreateUser}>Pré-registrar Usuário</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        <AlertDialog open={isDeleteUserDialogOpen} onOpenChange={setIsDeleteUserDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                        Você tem certeza que deseja excluir o usuário {selectedUser?.displayName}? Esta ação é permanente e removerá o usuário da autenticação e do banco de dados.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteUser} className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}>
                        Excluir Usuário
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        
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
                <TabsTrigger value="users">Usuários</TabsTrigger>
                <TabsTrigger value="feedback">Feedbacks</TabsTrigger>
                <TabsTrigger value="legal">Alertas Jurídicos</TabsTrigger>
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
                                <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <LineChart className="h-5 w-5 text-muted-foreground" />
                                        <CardTitle>Interações ao Longo do Tempo</CardTitle>
                                    </div>
                                    <CardDescription>
                                        Visualização do número de perguntas feitas por dia ou por hora.
                                    </CardDescription>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground"/>
                                    <Select value={interactionsRoleFilter} onValueChange={(value) => handleInteractionsFilterChange(value as UserRole | 'all')}>
                                        <SelectTrigger className="w-full sm:w-[180px]">
                                            <SelectValue placeholder="Filtrar por papel..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os Usuários</SelectItem>
                                            <SelectItem value="user">Apenas Usuários</SelectItem>
                                            <SelectItem value="admin">Apenas Admins</SelectItem>
                                            <SelectItem value="beta">Apenas Betas</SelectItem>
                                        </SelectContent>
                                     </Select>
                                  </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {isFetchingInsights ? (
                                    <div className="h-[350px] flex items-center justify-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
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
                                )}
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
                    <div className="grid gap-4 md:grid-cols-2 md:gap-8">
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
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <SearchX className="h-5 w-5 text-muted-foreground" />
                                    <CardTitle>Perguntas que Falharam na Busca Interna</CardTitle>
                                </div>
                                <CardDescription>
                                    Perguntas que não encontraram resposta na base de conhecimento.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[80%]">Pergunta do Usuário</TableHead>
                                            <TableHead className="text-right">Data</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {insights?.failedRagQueries && insights.failedRagQueries.length > 0 ? (
                                            insights.failedRagQueries
                                                .slice() // Cria uma cópia rasa do array para não mutar o original
                                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Ordena pela data mais recente
                                                .map((item, index) => (
                                                <TableRow key={index}>
                                                    <TableCell className="font-medium">{item.query}</TableCell>
                                                    <TableCell className="text-right text-xs">
                                                        {new Date(item.date).toLocaleString('pt-BR', {
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="h-24 text-center">
                                                    Nenhuma falha de busca RAG registrada.
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
            <TabsContent value="users" className="mt-4 space-y-8">
                 <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                           <div>
                             <CardTitle>Gerenciamento de Usuários Ativos</CardTitle>
                             <CardDescription>
                                 Adicione, edite e remova usuários e seus papéis no sistema.
                             </CardDescription>
                           </div>
                           <div className='flex items-center gap-2'>
                             <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as UserRole | 'all')}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="Filtrar por papel..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Papéis</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="beta">Beta</SelectItem>
                                    <SelectItem value="user">Usuário</SelectItem>
                                </SelectContent>
                             </Select>
                             <Button onClick={() => setIsAddUserDialogOpen(true)}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Pré-registrar
                             </Button>
                           </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                       <div className="w-full overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Papel</TableHead>
                                    <TableHead>Tour Concluído</TableHead>
                                    <TableHead>Data de Criação</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map(u => (
                                    <TableRow key={u.uid}>
                                        <TableCell className="font-medium">{u.displayName || 'N/A'}</TableCell>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>
                                            <Badge className={cn(roleDisplay[u.role]?.className)}>
                                                {roleDisplay[u.role]?.label || 'Usuário'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={u.hasCompletedOnboarding}
                                                onCheckedChange={(checked) => handleOnboardingToggle(u.uid, checked)}
                                                aria-label="Status do onboarding"
                                            />
                                        </TableCell>
                                        <TableCell>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                                        <TableCell className="text-right">
                                            {u.role !== 'admin' && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleOpenEditUserDialog(u)}>
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Editar Papel
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem 
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => handleOpenDeleteUserDialog(u)}>
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Excluir
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                       </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Usuários Pré-registrados</CardTitle>
                        <CardDescription>
                            Estes usuários foram convidados, mas ainda não fizeram o primeiro login.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-x-auto">
                            <Table>
                                 <TableHeader>
                                    <TableRow>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Papel Atribuído</TableHead>
                                        <TableHead>Data do Convite</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {preRegisteredUsers.length > 0 ? preRegisteredUsers.map(u => (
                                        <TableRow key={u.email}>
                                            <TableCell className="font-medium">{u.email}</TableCell>
                                            <TableCell>
                                                <Badge className={cn(roleDisplay[u.role]?.className)}>
                                                    {roleDisplay[u.role]?.label || 'Usuário'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center">
                                                Nenhum usuário pré-registrado no momento.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="feedback" className="mt-4">
                 <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                     <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <div className="flex items-center gap-2">
                                <ThumbsUp className="h-5 w-5 text-green-500" />
                                <CardTitle>Feedbacks Positivos ({feedbacks.positive.length})</CardTitle>
                            </div>
                            <CardDescription>
                                Respostas avaliadas como úteis.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                           <FeedbackAccordion feedbacks={feedbacks.positive} type="positive" />
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <div className="flex items-center gap-2">
                                <ThumbsDown className="h-5 w-5 text-red-500" />
                                <CardTitle>Feedbacks Negativos ({feedbacks.negative.length})</CardTitle>
                            </div>
                            <CardDescription>
                                Respostas que precisam de revisão.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FeedbackAccordion feedbacks={feedbacks.negative} type="negative" />
                        </CardContent>
                    </Card>
                </div>
                 <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4 mt-4">
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

   
    