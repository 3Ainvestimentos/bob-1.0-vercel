
'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, Loader2, Send, User, LogIn } from 'lucide-react';
import { askChatbot } from '@/ai/flows/chatbot-flow';
import { useAuth } from '@/context/auth-context';

interface Message {
  role: 'user' | 'model';
  text: string;
}

function ChatbotComponent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await askChatbot({ prompt: input });
      const modelMessage: Message = { role: 'model', text: result.response };
      setMessages((prev) => [...prev, modelMessage]);
    } catch (error) {
      console.error('Error calling chatbot flow:', error);
      const errorMessage: Message = {
        role: 'model',
        text: 'Desculpe, ocorreu um erro ao processar sua solicitação.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-[calc(100vh-12rem)] flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot />
            Chatbot Assistente
          </CardTitle>
          <CardDescription className="pt-2">
            Faça perguntas com base nos documentos do nosso Corpus de conhecimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="space-y-4 pr-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 ${
                    message.role === 'user' ? 'justify-end' : ''
                  }`}
                >
                  {message.role === 'model' && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback><Bot size={20}/></AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] whitespace-pre-wrap ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {message.text}
                  </div>
                   {message.role === 'user' && user && (
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
                        <AvatarFallback><User size={20}/></AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isLoading && (
                 <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                        <AvatarFallback><Bot size={20}/></AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg px-4 py-2 bg-muted flex items-center">
                        <Loader2 className="h-5 w-5 animate-spin"/>
                    </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter>
          <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua mensagem..."
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Enviar</span>
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}


export default function HomePage() {
    const { user, loading, signIn } = useAuth();
    const [hostname, setHostname] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setHostname(window.location.hostname);
        }
    }, []);

    if (loading) {
      return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
  
    if (!user) {
      return (
        <div className="container mx-auto flex h-[calc(100vh-8rem)] items-center justify-center">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>Acesso Restrito</CardTitle>
                    <CardDescription>Você precisa estar autenticado para acessar o chatbot.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={signIn}>
                        <LogIn className="mr-2 h-4 w-4" />
                        Entrar com Google
                    </Button>
                </CardContent>
                {hostname && (
                    <CardFooter className="flex-col gap-2 pt-4">
                        <p className="text-xs text-muted-foreground">Problemas com o login?</p>
                        <p className="text-xs text-muted-foreground">
                            Adicione o seguinte domínio aos seus domínios autorizados do Firebase Authentication:
                        </p>
                        <div className="mt-2 text-sm font-semibold bg-muted text-muted-foreground rounded-md px-3 py-1">
                            {hostname}
                        </div>
                    </CardFooter>
                )}
            </Card>
        </div>
      );
    }
  
    return (
        <Suspense fallback={
          <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }>
            <ChatbotComponent />
        </Suspense>
    );
}
