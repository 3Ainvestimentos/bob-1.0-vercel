'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, User, Bot } from 'lucide-react';
import { askChatbot, ChatbotInput } from '@/ai/flows/chatbot-flow';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TestPanel } from '@/components/test-panel';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
      const history = messages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      const chatbotInput: ChatbotInput = {
        history: history.slice(-10), // Keep history from getting too long
        prompt: input,
      };

      const responseText = await askChatbot(chatbotInput);
      const botMessage: Message = { role: 'model', text: responseText };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error communicating with AI:', error);
      const errorMessage: Message = {
        role: 'model',
        text: 'Desculpe, ocorreu um erro ao me comunicar com a IA. Por favor, tente novamente.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col lg:flex-row items-start justify-center gap-4 p-4">
      {/* Chatbot Card */}
      <Card className="w-full lg:w-2/3 h-full flex flex-col">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Assistente RAG</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.length === 0 && (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <Bot className="w-16 h-16 mb-4" />
                    <p className="text-lg">Comece a conversar com seu assistente.</p>
                    <p>Faça uma pergunta sobre seus documentos.</p>
                 </div>
              )}
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 ${
                    msg.role === 'user' ? 'justify-end' : ''
                  }`}
                >
                  {msg.role === 'model' && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <Bot size={20} />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg p-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.text}
                  </div>
                  {msg.role === 'user' && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <User size={20} />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <Bot size={20} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg p-3 flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Pensando...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <form
            onSubmit={handleSubmit}
            className="flex w-full items-center gap-2"
          >
            <Input
              type="text"
              placeholder="Pergunte algo ao seu corpus..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar'
              )}
            </Button>
          </form>
        </CardFooter>
      </Card>

      {/* Test Panel */}
      <TestPanel />
    </div>
  );
}
