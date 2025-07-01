
'use client';

import { askAssistant } from '@/app/actions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  HelpCircle,
  Lightbulb,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Newspaper,
  PanelLeft,
  Plus,
  PlusSquare,
  RectangleEllipsis,
  RefreshCw,
  Search,
  Settings,
  Shield,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';

// Define the shape of a message
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const assistantResponse = await askAssistant(input);
      const assistantMessage: Message = { role: 'assistant', content: assistantResponse };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="flex min-h-screen w-full bg-card text-card-foreground">
      <aside className="hidden w-[280px] flex-col border-r bg-card p-4 md:flex">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>M</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">Matheus</p>
            <p className="text-sm text-muted-foreground">matheus@example.com</p>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-2">
          <Button variant="ghost" className="justify-start gap-2">
            <PlusSquare className="h-4 w-4" />
            Novo Projeto
          </Button>
          <Button variant="secondary" className="justify-start gap-2">
            <MessageSquare className="h-4 w-4" />
            Nova conversa
          </Button>
        </nav>

        <div className="mt-4 flex-1">
          <p className="px-2 text-xs font-medium text-muted-foreground">Nenhum projeto criado.</p>
        </div>
        
        <div className="mt-4 border-t border-border pt-4">
          <p className="px-2 text-xs font-medium text-muted-foreground">Nenhuma conversa recente.</p>
          <div className="mt-2 p-2 text-center text-sm text-muted-foreground">
            <p>Nenhuma conversa ou projeto ainda. Crie um novo projeto ou uma nova conversa!</p>
          </div>
        </div>

        <nav className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
          <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <HelpCircle className="h-4 w-4" />
            Guias e FAQ
          </a>
          <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <Settings className="h-4 w-4" />
            Configurações
          </a>
          <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <LogOut className="h-4 w-4" />
            Sair
          </a>
        </nav>
      </aside>

      <main className="flex flex-1 flex-col bg-background">
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:justify-end lg:px-6">
            <Button variant="ghost" size="icon" className="md:hidden">
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle Sidebar</span>
            </Button>
            <Avatar>
                <AvatarFallback>M</AvatarFallback>
            </Avatar>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto flex h-full max-w-3xl flex-col">
            {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center">
                  <div>
                    <div className="text-left">
                      <h1 className="text-4xl font-bold">Olá, Matheus! 👋</h1>
                      <p className="mt-2 text-lg text-muted-foreground">Como posso te ajudar hoje?</p>
                    </div>

                    <div className="mt-12">
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground">Você também pode me perguntar assim:</p>
                        <Button variant="ghost" size="icon">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                          <div className="flex items-start gap-4">
                            <Newspaper className="h-6 w-6 text-yellow-400/80" />
                            <div>
                              <p className="font-semibold">Buscar notícias sobre IA</p>
                              <p className="text-sm text-muted-foreground">Explorar os últimos acontecimentos no mundo da IA</p>
                            </div>
                          </div>
                        </Card>
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                          <div className="flex items-start gap-4">
                            <Mail className="h-6 w-6 text-yellow-400/80" />
                            <div>
                              <p className="font-semibold">Criar campanha de e-mail</p>
                              <p className="text-sm text-muted-foreground">para vendas de fim de ano</p>
                            </div>
                          </div>
                        </Card>
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                          <div className="flex items-start gap-4">
                            <Lightbulb className="h-6 w-6 text-yellow-400/80" />
                            <div>
                              <p className="font-semibold">Preparar tópicos</p>
                              <p className="text-sm text-muted-foreground">para uma entrevista sobre vida de nômade digital</p>
                            </div>
                          </div>
                        </Card>
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                          <div className="flex items-start gap-4">
                            <FileText className="h-6 w-6 text-yellow-400/80" />
                            <div>
                              <p className="font-semibold">Analisar um novo artigo</p>
                              <p className="text-sm text-muted-foreground">Resumir e destacar pontos chave de um artigo científico</p>
                            </div>
                          </div>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role === 'assistant' && (
                      <Avatar>
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`rounded-lg p-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                     {msg.role === 'user' && (
                      <Avatar>
                        <AvatarFallback>M</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                 {isLoading && (
                    <div className="flex items-start gap-4">
                        <Avatar>
                            <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <div className="rounded-lg bg-muted p-3">
                            <p className="text-sm">Pensando...</p>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="flex items-start gap-4">
                         <Avatar>
                            <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <div className="rounded-lg bg-destructive p-3 text-destructive-foreground">
                            <p className="text-sm">{error}</p>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="sticky bottom-0 w-full bg-background/95 p-4 backdrop-blur-sm">
            <div className="relative mx-auto flex max-w-3xl flex-col rounded-2xl bg-muted p-3">
              <div className="flex items-center">
                <Shield className="mr-2 h-5 w-5 shrink-0 text-muted-foreground" />
                <Textarea
                  placeholder="Insira um comando para o Gemini"
                  className="flex-1 resize-none self-end border-0 bg-transparent p-0 text-base focus-visible:ring-0"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      handleSubmit(e);
                    }
                  }}
                  disabled={isLoading}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary">
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                    <Search className="mr-2 h-4 w-4" />
                    Deep Research
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                    <RectangleEllipsis className="mr-2 h-4 w-4" />
                    Canvas
                  </Button>
                </div>
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary" disabled={isLoading}>
                    <Mic className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
        </form>
      </main>
    </div>
  );
}
