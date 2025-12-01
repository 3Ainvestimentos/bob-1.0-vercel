
'use client';

import { Message, AttachedFile } from '@/types';
import { Conversation } from '@/app/chat/ChatPage';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  FileText,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Hand,
  UserPlus,
  KeyRound,
  PiggyBank,
  Wand2,
  Copy,
  Check,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BobIcon } from '@/components/icons/BobIcon';
import rehypeRaw from 'rehype-raw';
import { POSICAO_CONSOLIDADA_PREAMBLE } from './preambles';
import { cn } from '@/lib/utils';


interface ChatMessageAreaProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  user: User | null;
  userName: string;
  userInitials: string;
  lastFailedQuery: string | null;
  feedbacks: Record<string, 'positive' | 'negative'>;
  regeneratingMessageId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onFeedback: (message: Message, rating: 'positive' | 'negative') => void;
  onRegenerate: (messageId: string) => void;
  onCopyToClipboard: (text: string) => void;
  onReportLegalIssueRequest: (message: Message) => void;
  onOpenFeedbackDialog: (message: Message) => void;
  onWebSearch: () => void;
  onSuggestionClick: (suggestion: string) => void;
  activeChat: Conversation | null;
  onRemoveFile: (fileId: string) => void;
}

const webSearchSuggestions = [
    {
        Icon: KeyRound,
        title: "Como alterar uma senha",
        description: "Ajudar um cliente a redefinir o acesso",
    },
    {
        Icon: PiggyBank,
        title: "Como fazer um resgate de previdência",
        description: "Consultar as regras e o procedimento",
    }
];

const PreWithCopy = ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
    const [isCopied, setIsCopied] = useState(false);

    const textToCopy = React.useMemo(() => {
        if (!children || typeof children !== 'object' || !('props' in children)) {
            return '';
        }
        const codeElement = children.props.children;
        if (typeof codeElement === 'string') {
            return codeElement;
        }
        if (Array.isArray(codeElement)) {
            return codeElement.map(child => (typeof child === 'string' ? child : '')).join('');
        }
        return '';
    }, [children]);

    const handleCopy = () => {
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    return (
        <div className="relative group">
            <pre {...props}>{children}</pre>
            <Button
                size="icon"
                variant="ghost"
                className={cn(
                    "absolute top-2 right-2 h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10",
                    isCopied && "opacity-100"
                )}
                onClick={handleCopy}
            >
                {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
        </div>
    );
};

export function ChatMessageArea({
  messages,
  isLoading,
  error,
  user,
  userName,
  userInitials,
  lastFailedQuery,
  feedbacks,
  regeneratingMessageId,
  messagesEndRef,
  onFeedback,
  onRegenerate,
  onCopyToClipboard,
  onReportLegalIssueRequest,
  onOpenFeedbackDialog,
  onWebSearch,
  onSuggestionClick,
  activeChat,
  onRemoveFile,
}: ChatMessageAreaProps) {

  // ✅ MOVER o useState para DENTRO do componente
  const [messageFormat, setMessageFormat] = useState<'whatsapp' | 'email'>('whatsapp');
  
  // ✅ MOVER a função para DENTRO do componente
  const processContentForFormat = (content: string, format: 'whatsapp' | 'email'): string => {
    if (format === 'whatsapp') {
      // WhatsApp: manter formatação markdown
      return content.replace(/\\\*/g, '*').replace(/\\#/g, '#').replace(/\\_/g, '_').replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
    } else {
      // Email: remover formatação markdown
      return content.replace(/\\\*/g, '').replace(/\\#/g, '').replace(/\\_/g, '').replace(/\*/g, '').replace(/#/g, '').replace(/_/g, '');
    }
  };
  const activeChatId = activeChat?.id ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center">
            {/* <BobIcon className="mb-6 h-24 w-24" isGreeting={true} /> */}
            <div>
              <div className="text-left">
                <h1 className="flex items-center gap-3 text-4xl font-bold">
                  <span>Olá, {userName.split(' ')[0]}!</span>
                  <Hand className="h-10 w-10 animate-wave" style={{ color: '#DFB87F' }} />
                </h1>
                <p className="mt-2 text-lg text-muted-foreground">
                  Como posso te ajudar hoje?
                </p>
              </div>
              <div className="mt-12">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground">
                    Clique em um card para começar ou digite abaixo:
                  </p>
                </div>
                <div id="suggestion-cards" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                   <Card className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md h-full" onClick={() => onSuggestionClick('open_prompt_builder')}>
                    <div className="flex items-start gap-4">
                      <Wand2 className="h-6 w-6 text-muted-foreground" style={{ color: '#DFB87F' }} />
                      <div>
                        <p className="font-semibold">Análise de Relatório de Perfomance XP</p>
                        <p className="text-sm text-muted-foreground">
                          Mensagem de relacionamento com o padrão 3A RIVA
                        </p>
                      </div>
                    </div>
                  </Card>
                   <Card className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md h-full" onClick={() => onSuggestionClick('Como acessar o informe de rendimentos?')}>  
                     {/* antigo 'open_meeting_insights' */}
                    <div className="flex items-start gap-4">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">Como acessar o informe de rendimentos</p>
                        <p className="text-sm text-muted-foreground">
                          Encontre o passo a passo para obter o documento
                        </p>
                      </div>
                    </div>
                  </Card>
                   {webSearchSuggestions.map((suggestion, index) => (
                      <Card key={index} className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md h-full" onClick={() => onSuggestionClick(suggestion.title)}>
                        <div className="flex items-start gap-4">
                          <suggestion.Icon className="h-6 w-6 text-muted-foreground" />
                          <div>
                            <p className="font-semibold">{suggestion.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {suggestion.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                   ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((msg) => (
              <React.Fragment key={msg.id}>
                {msg.role === 'assistant' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          <BobIcon className="h-6 w-6" isThinking={regeneratingMessageId === msg.id} />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold text-foreground">Bob</span>
                    </div>
                    {regeneratingMessageId === msg.id ? (
                      <div className="w-fit rounded-xl bg-muted px-4 py-2">
                          <p className="animate-pulse text-sm italic text-muted-foreground">
                              Bob está pensando...
                          </p>
                      </div>
                    ) : (
                      <>
                                {/* RENDERIZAÇÃO CONDICIONAL PARA RELATÓRIOS */}
                          {(() => {
                            console.log('🔍 DEBUG ChatMessageArea- msg.content:', msg.content);
                            console.log('🔍 DEBUG ChatMessageArea- contains emojis:', msg.content.includes('🔎') || msg.content.includes('✅') || msg.content.includes('⚠️') || msg.content.includes('🌎'));
                            
                            return msg.content.includes('🔎') || msg.content.includes('✅') || msg.content.includes('⚠️') || msg.content.includes('🌎') || msg.ultraBatchJobId;
                          })() ? (
                            // Para relatórios: separar análises individuais
                            <div className="space-y-4">
                              {/* Cabeçalho com título e seletor de formato */}
                              <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-foreground">
                                  Análise de {msg.ultraBatchTotal || msg.fileNames?.length || msg.content.split('```').filter((_: any, index: number) => index % 2 === 1).length} relatório(s) XP
                                </h3>
                                
                                {/* Seletor de formato */}
                                <div className="flex items-center bg-background/80 backdrop-blur-sm rounded-xl border overflow-hidden">
                                  <button
                                    onClick={() => setMessageFormat('whatsapp')}
                                    className={`w-28 px-3 py-1 text-sm rounded-l-xl transition-colors ${
                                      messageFormat === 'whatsapp' 
                                        ? 'bg-green-500 text-white' 
                                        : 'bg-background text-foreground hover:bg-muted'
                                    }`}
                                  >
                                    📱 WhatsApp
                                  </button>
                                  <button
                                    onClick={() => setMessageFormat('email')}
                                    className={`w-28 px-3 py-1 text-sm rounded-r-xl transition-colors ${
                                      messageFormat === 'email' 
                                        ? 'bg-blue-500 text-white' 
                                        : 'bg-background text-foreground hover:bg-muted'
                                    }`}
                                  >
                                    📧 Email
                                  </button>
                                </div>
                              </div>

                              {msg.ultraBatchJobId && (
  <div className="bg-primary/10 dark:bg-custom-dark-green/10 p-4 mb-4 rounded-xl border border-custom-dark-green/20 dark:border-primary/20">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-muted-foregroun flex items-center gap-2">
        {(msg.ultraBatchProgress?.current || 0) === 0 ? (
          <>
            <span className="inline-block animate-spin">⏳</span>
            Iniciando Processamento Ultra Lote
          </>
        ) : (
          <>
            <span className="inline-block">📊</span>
            Processando Ultra Lote
          </>
        )}
      </span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foregroun font-medium">
          {msg.ultraBatchProgress?.current || 0}/{msg.ultraBatchTotal || 0} arquivos
        </span>
        {!msg.ultraBatchEstimatedTimeMinutes && (
          <span className="text-sm text-muted-foregroun">
            ⏱️ ~{msg.ultraBatchEstimatedTimeMinutes} min
          </span>
        )}
      </div>
    </div>
    
    {/* Barra de Progresso */}
    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden border border-border">
        <div 
          className={`h-2.5 rounded-full bg-primary transition-all duration-500 ${
            // Adiciona a animação de pulso se o progresso NÃO estiver completo
            (msg.ultraBatchProgress?.current || 0) < (msg.ultraBatchProgress?.total || 1)
              ? 'animate-pulse'
              : ''
          }`}
          style={{ 
            width: `${
              ((msg.ultraBatchProgress?.current || 0) / (msg.ultraBatchProgress?.total || 1)) * 100
            }%` 
          }}
        />
      </div>
    
    {/* Mensagem de Status */}
    {(msg.ultraBatchProgress?.current || 0) === 0 ? (
      <p className="text-xs text-muted-foreground mt-2 animate-pulse flex items-center gap-2">
        <span className="inline-block w-1 h-1 bg-primary rounded-full animate-bounce"></span>
        <span className="inline-block w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
        <span className="inline-block w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
        <span className="ml-1">Preparando análise dos {msg.ultraBatchTotal || 0} arquivos...</span>
      </p>
    ) : (
      <p className="text-xs text-muted-foreground mt-2">
        ✅ {Math.round(((msg.ultraBatchProgress?.current || 0) / (msg.ultraBatchTotal || 1)) * 100)}% concluído
      </p>
    )}
  </div>
)}

                              {/* Renderizar lotes se disponível, senão usar método antigo */}
                              {msg.ultraBatchBatches && msg.ultraBatchBatches.length > 0 ? (
                                // Nova renderização com lotes
                                <div className="space-y-4">
                                  {msg.ultraBatchBatches.map((batch: any, batchIndex: number) => (
                                    <Accordion key={`batch-${batch.batchNumber}`} type="single" collapsible className="w-full">
                                      <AccordionItem value={`batch-${batch.batchNumber}`}>
                                        <AccordionTrigger className="text-md font-medium text-foreground hover:no-underline">
                                          📁 Lote {batch.batchNumber} ({batch.files.length} arquivos)
                                        </AccordionTrigger>
                                        <AccordionContent>
                                          <div className="space-y-4">
                                            {batch.files.map((file: any, fileIndex: number) => (
                                              <div key={`file-${fileIndex}`} className="border rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                  <span className="font-medium text-sm">{file.fileName}</span>
                                                  <span className={`text-xs px-2 py-1 rounded ${
                                                    file.success 
                                                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                  }`}>
                                                    {file.success ? 'Sucesso' : 'Erro'}
                                                  </span>
                                                </div>
                                                <div className="w-full h-90 rounded-xl bg-slate-800 dark:bg-gray-950 px-4 py-2 overflow-x-auto overflow-y-hidden">   
                                                  <PreWithCopy>
                                                    <code className="whitespace-nowwrap break-words text-xs text-white font-mono min-w-max">
                                                      {processContentForFormat(file.content, messageFormat)}
                                                    </code>
                                                  </PreWithCopy>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </AccordionContent>
                                      </AccordionItem>
                                    </Accordion>
                                  ))}
                                </div>
                              ) : (
                                // Método antigo para compatibilidade
                                msg.content.split('```').filter((block: any, index: number) => index % 2 === 1).map((analysis: any, index: number) => {
                                  const processedContent = processContentForFormat(analysis.trim(), messageFormat);
                                  
                                  return (
                                    <Accordion key={index} type="single" collapsible className="w-full" defaultValue={`chunk-${index}`}>
                                      <AccordionItem value={`chunk-${index}`}>
                                        <AccordionTrigger className="text-md font-medium text-foreground hover:no-underline">
                                          {msg.fileNames?.[index] || `Chunk ${index + 1}`}
                                        </AccordionTrigger>
                                        <AccordionContent>
                                          <div className="w-full h-90 rounded-xl bg-slate-800 dark:bg-gray-950 px-4 py-2 overflow-x-auto overflow-y-hidden">   
                                            <PreWithCopy>
                                              <code className="whitespace-nowwrap break-words text-xs text-white font-mono min-w-max">
                                                {processedContent}
                                              </code>
                                            </PreWithCopy>
                                          </div>
                                        </AccordionContent>
                                      </AccordionItem>
                                    </Accordion>
                                  );
                                })
                              )}
                            </div>
                          ) : (
                            // Para outros conteúdos: usar ReactMarkdown normal
                            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                              <ReactMarkdown 
                                rehypePlugins={[rehypeRaw]}
                                components={{
                                  pre: PreWithCopy
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          )}
                        {activeChatId && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Button variant="ghost" size="icon" className={`h-8 w-8 ${feedbacks[msg.id] === 'positive' ? 'bg-primary/10 text-primary' : ''}`} onClick={() => onFeedback(msg, 'positive')}>
                                <ThumbsUp className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className={`h-8 w-8 ${feedbacks[msg.id] === 'negative' ? 'bg-destructive/10 text-destructive' : ''}`} onClick={() => onFeedback(msg, 'negative')}>
                                <ThumbsDown className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRegenerate(msg.id)} disabled={isLoading || !!regeneratingMessageId}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onCopyToClipboard(msg.content)}>
                                <Share2 className="h-4 w-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem
                                    onClick={() => onReportLegalIssueRequest(msg)}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <AlertTriangle className="mr-2 h-4 w-4" />
                                    <span>Informar problema jurídico</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {feedbacks[msg.id] === 'negative' && (
                                <Button variant="link" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onOpenFeedbackDialog(msg)}>
                                  Adicionar feedback
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start justify-end gap-4">
                    <div className="max-w-[80%] rounded-xl bg-user-bubble p-3 text-user-bubble-foreground shadow-sm">
                      {msg.fileNames && (
                          <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-background/50 p-2 text-xs text-muted-foreground">
                              <Paperclip className="h-4 w-4 shrink-0" />
                              <span className="truncate">{msg.fileNames.join(', ')}</span>
                          </div>
                      )}
                      <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none" rehypePlugins={[rehypeRaw]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    <Avatar>
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </React.Fragment>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback>
                    <BobIcon className="h-6 w-6" isThinking />
                  </AvatarFallback>
                </Avatar>
                <div className="w-fit rounded-xl bg-muted px-4 py-2">
                    <p className="animate-pulse text-sm italic text-muted-foreground">
                        Bob está pensando...
                    </p>
                </div>
              </div>
            )}
            {error && !isLoading && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <BobIcon className="h-6 w-6" hasError={true} />
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-foreground">Bob</span>
                </div>
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-destructive-foreground">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
