import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronDown,
  FileText,
  Gem,
  HelpCircle,
  Lightbulb,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Newspaper,
  PanelLeft,
  Paperclip,
  PlusSquare,
  RefreshCw,
  Send,
  Settings,
} from 'lucide-react';

export default function DashboardPage() {
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
          <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center">
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
        </div>
        
        <div className="sticky bottom-0 w-full bg-background/95 p-4 backdrop-blur-sm">
            <div className="relative mx-auto max-w-3xl">
              <Textarea
                placeholder="Insira aqui um comando ou pergunta"
                className="min-h-[48px] resize-none rounded-2xl border bg-card p-4 pr-16 shadow-sm"
              />
              <div className="absolute bottom-3 left-4 flex gap-2">
                 <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary">
                    <Paperclip className="h-4 w-4" />
                 </Button>
                 <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary">
                    <Mic className="h-4 w-4" />
                 </Button>
              </div>
              <Button type="submit" size="icon" className="absolute bottom-3 right-3 h-8 w-8 rounded-full">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between text-xs">
                <p className="flex-1 text-muted-foreground">
                    Sujeito aos Termos de uso 3A RIVA e à Política de Privacidade da 3A RIVA. O modelo Bob 1.0 pode cometer erros. Por isso, é bom checar as respostas.
                </p>
                <Button variant="ghost" size="sm" className="ml-4 text-muted-foreground">
                    <Gem className="mr-2 h-3 w-3" />
                    Gemini 1.5 Pro
                    <ChevronDown className="ml-2 h-3 w-3" />
                </Button>
            </div>
        </div>
      </main>
    </div>
  );
}
