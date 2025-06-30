'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, Loader2, Send, User, LogIn } from 'lucide-react';
import { askGemini } from '@/ai/flows/gemini-chat-flow';
import { useAuth } from '@/context/auth-context';

type Message = {
  author: 'user' | 'assistant';
  content: string;
};

export default function HomePage() {
  const { user, signIn } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { author: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await askGemini({ prompt: input });
      const assistantMessage: Message = { author: 'assistant', content: result.response };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error calling Gemini:', error);
      const errorMessage: Message = {
        author: 'assistant',
        content: 'Desculpe, ocorreu um erro ao me comunicar com a IA. Por favor, tente novamente.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

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
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <CardContent className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className={`flex items-start gap-3 ${message.author === 'user' ? 'justify-end' : ''}`}>
            {message.author === 'assistant' && (
              <Avatar className="h-8 w-8">
                <AvatarFallback><Bot /></AvatarFallback>
              </Avatar>
            )}
            <div className={`max-w-md rounded-lg px-4 py-2 ${message.author === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
            </div>
            {message.author === 'user' && (
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.photoURL || undefined} />
                <AvatarFallback><User /></AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
         {isLoading && (
          <div className="flex items-start gap-3">
             <Avatar className="h-8 w-8">
                <AvatarFallback><Bot /></AvatarFallback>
              </Avatar>
            <div className="max-w-md rounded-lg bg-muted px-4 py-2">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      <Card className="rounded-t-none border-x-0 border-b-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem..."
            disabled={isLoading}
            autoComplete="off"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Enviar</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
