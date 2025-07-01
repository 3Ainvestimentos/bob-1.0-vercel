'use client';

import {useState, useRef, useEffect, type FormEvent} from 'react';
import {ArrowUp, Bot, Loader2, ServerCrash, User} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {ScrollArea} from '@/components/ui/scroll-area';
import {searchDiscoveryEngine, type DiscoveryEngineOutput} from '@/ai/flows/discovery-engine-flow';
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from '@/components/ui/accordion';
import {useAuth} from '@/context/auth-context';
import {useRouter} from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string | React.ReactNode;
}

export default function ChatApiPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    // Scroll to the bottom when messages change
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };
  
  const formatAssistantResponse = (response: DiscoveryEngineOutput) => {
    return (
      <div>
        <p className="mb-4">{response.summary}</p>
        {response.results && response.results.length > 0 && (
           <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>Fontes</AccordionTrigger>
              <AccordionContent>
                <ul className="list-inside list-disc space-y-2">
                  {response.results.map((result) => (
                    <li key={result.id}>
                      <a href={result.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {result.title || 'Fonte sem título'}
                      </a>
                      <p className="pl-4 text-xs text-muted-foreground">{result.snippet}</p>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    );
  };


  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    const userMessage: Message = {role: 'user', content: input};
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await searchDiscoveryEngine({query: input, userPseudoId: user.uid});
      const assistantMessage: Message = {
        role: 'assistant',
        content: formatAssistantResponse(response),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error(error);
      const errorMessage: Message = {
        role: 'assistant',
        content: (
          <div className="text-destructive">
            <ServerCrash className="mb-2 inline-block h-5 w-5" />
            <p className="font-bold">Ocorreu um erro ao conectar ao assistente.</p>
            <p className="text-xs">{error.message}</p>
          </div>
        ),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col p-4 md:p-6">
      <Card className="flex flex-1 flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center gap-4">
            <Bot className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Assistente via API</CardTitle>
              <CardDescription>
                Faça uma pergunta para a base de conhecimento.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-4 md:p-6" ref={scrollAreaRef}>
            <div className="space-y-6">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <Bot className="mb-4 h-12 w-12" />
                  <p>Comece a conversa digitando sua pergunta abaixo.</p>
                </div>
              )}
              {messages.map((message, index) => (
                <div key={index} className="flex items-start gap-4">
                  {message.role === 'assistant' ? (
                    <Bot className="h-6 w-6 flex-shrink-0 text-primary" />
                  ) : (
                    <User className="h-6 w-6 flex-shrink-0" />
                  )}
                  <div className="flex-1 space-y-2 overflow-hidden rounded-lg bg-muted/50 px-4 py-3">
                    <div className="text-sm prose-sm max-w-none">{message.content}</div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start gap-4">
                  <Bot className="h-6 w-6 flex-shrink-0 text-primary" />
                  <div className="flex-1 space-y-2 overflow-hidden rounded-lg bg-muted/50 px-4 py-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 border-t p-4">
           <p className="text-sm font-medium text-muted-foreground">Sugestão:</p>
           <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSuggestionClick('Quem é gabriela Rocha?')}
            >
              Quem é Gabriela Rocha?
            </Button>
           </div>
          <form onSubmit={handleSubmit} className="flex w-full items-center gap-2 pt-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta aqui..."
              disabled={isLoading}
              autoComplete="off"
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <ArrowUp className="h-5 w-5" />
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
