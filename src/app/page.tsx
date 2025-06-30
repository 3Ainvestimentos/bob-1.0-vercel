'use client';

import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, LogIn, Send, Bot } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { askGemini } from '@/ai/flows/gemini-chat-flow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';


// --- Top Half: Standard Gemini Chatbot ---
function GeminiChatbot() {
    const [messages, setMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewportRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();

    useEffect(() => {
        if (scrollViewportRef.current) {
            scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user' as const, content: input };
        setMessages((prev) => [...prev, userMessage]);
        const currentInput = input;
        setInput('');
        setIsLoading(true);

        try {
            const result = await askGemini({ prompt: currentInput });
            const modelMessage = { role: 'model' as const, content: result.response };
            setMessages((prev) => [...prev, modelMessage]);
        } catch (error) {
            console.error("Error calling Gemini proxy:", error);
            const errorMessage = { role: 'model' as const, content: "Desculpe, ocorreu um erro ao me conectar com o serviço de chat. Por favor, tente novamente." };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const getInitials = (name?: string | null) => {
        if (!name) return 'U';
        const names = name.split(' ');
        if (names.length > 1) {
            return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <Card className="flex h-full flex-col">
            <CardHeader>
                <CardTitle>Assistente RAG</CardTitle>
                <CardDescription>Converse com seus documentos usando o Gradio e o Vertex AI RAG.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4" ref={scrollViewportRef}>
                <div className="space-y-4">
                    {messages.length === 0 && (
                        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                            <Bot className="mb-2 h-10 w-10" />
                            <p className="text-lg font-medium">Comece a conversar</p>
                            <p className="text-sm">Faça uma pergunta sobre seus documentos.</p>
                        </div>
                    )}
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={cn(
                                'flex items-start gap-3',
                                message.role === 'user' ? 'justify-end' : 'justify-start'
                            )}
                        >
                            {message.role === 'model' && (
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                                </Avatar>
                            )}
                            <div
                                className={cn(
                                    'max-w-[75%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                                    message.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted'
                                )}
                            >
                                {message.content}
                            </div>
                            {message.role === 'user' && user && (
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'}/>
                                    <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                                </Avatar>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start gap-3">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                            </Avatar>
                            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
            <CardFooter className="border-t p-4 pt-4">
                <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        disabled={isLoading}
                        autoComplete="off"
                    />
                    <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Enviar</span>
                    </Button>
                </form>
            </CardFooter>
        </Card>
    );
}

// --- Bottom Half: Gradio Application ---
function GradioEmbed() {
  const gradioUrl = `https://genai-app-locatingandassessingola-1-1751046095728-629342546806.us-central1.run.app/?key=${process.env.NEXT_PUBLIC_GRADIO_API_KEY}`;

  if (!process.env.NEXT_PUBLIC_GRADIO_API_KEY || process.env.NEXT_PUBLIC_GRADIO_API_KEY.includes('YOUR_SECRET_KEY')) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Card className="w-full max-w-xl border-destructive">
            <CardHeader>
                <CardTitle className="text-center text-2xl text-destructive">Erro de Configuração do Gradio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
                <p className="text-muted-foreground">
                    A chave da API para a aplicação Gradio não foi encontrada.
                </p>
                <div className="text-left">
                    <p className="font-semibold">Por favor, verifique os seguintes passos:</p>
                    <ul className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                        <li>Abra o arquivo <code>.env</code> na raiz do seu projeto.</li>
                        <li>Certifique-se de que a variável <code>NEXT_PUBLIC_GRADIO_API_KEY</code> está definida com a chave correta.</li>
                        <li>Após salvar as alterações, **reinicie o servidor de desenvolvimento**.</li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    </div>
    )
  }

  return (
      <iframe
        src={gradioUrl}
        frameBorder="0"
        className="h-full w-full rounded-lg border"
        title="Gradio App"
      ></iframe>
  );
}

// --- Main Page Component ---
export default function HomePage() {
    const { user, signIn } = useAuth();
  
    if (!user) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-background">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>Acesso Restrito</CardTitle>
                    <CardDescription>Você precisa estar autenticado para acessar a aplicação.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={signIn}>
                        <LogIn className="mr-2 h-4 w-4" />
                        Entrar com Google
                    </Button>
                </CardContent>
            </Card>
        </div>
      );
    }
  
    return (
      <div className="flex h-screen flex-col p-4">
        {/* Top Section */}
        <div className="flex-1 min-h-0 pb-2">
            <GeminiChatbot />
        </div>
        
        <Separator className="my-2" />

        {/* Bottom Section */}
        <div className="flex-1 min-h-0 pt-2">
            <Suspense fallback={
              <div className="flex h-full w-full items-center justify-center">
                <Card className="flex h-full w-full flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Carregando aplicação...</p>
                </Card>
              </div>
            }>
                <GradioEmbed />
            </Suspense>
        </div>
      </div>
    );
}
