
'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { File, Mic, Paperclip, SendHorizontal, X } from 'lucide-react';
import React, { FormEvent, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

interface ChatInputFormProps {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: FormEvent) => void;
  isLoading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  activeChatHasFile: boolean;
}

export function ChatInputForm({
  input,
  setInput,
  handleSubmit,
  isLoading,
  inputRef,
  selectedFile,
  setSelectedFile,
  activeChatHasFile,
}: ChatInputFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className="sticky bottom-0 w-full bg-background/95 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="px-4 pb-4 pt-2 sm:px-6 lg:px-8"
      >
        <div className={cn("rounded-lg border bg-background shadow-sm", selectedFile && "relative pb-10")}>
          {selectedFile && (
            <div className="absolute bottom-11 left-2 w-[calc(100%-1rem)] p-2">
                <Badge variant="secondary" className="flex max-w-full items-center justify-between gap-2 pl-2 pr-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <File className="h-4 w-4 shrink-0"/>
                        <span className="truncate text-xs">{selectedFile.name}</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0 rounded-full" onClick={handleRemoveFile}>
                        <X className="h-3 w-3" />
                    </Button>
                </Badge>
            </div>
          )}
          <div className="relative flex min-h-[60px] items-start">
            <TextareaAutosize
              ref={inputRef}
              placeholder="Insira aqui um comando ou pergunta"
              className="min-h-[inherit] flex-1 resize-none border-0 bg-transparent p-4 pr-12 text-base focus-visible:ring-0"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (e.currentTarget.form) {
                    e.currentTarget.form.requestSubmit();
                  }
                }
              }}
              disabled={isLoading}
              rows={1}
              maxRows={8}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground"
              disabled={isLoading || (!input.trim() && !selectedFile && !activeChatHasFile)}
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>
          <Separator />
          <div className="flex items-center p-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.doc,.docx,text/plain,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isLoading || activeChatHasFile}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              disabled={isLoading || activeChatHasFile}
              onClick={handleAttachClick}
              title={activeChatHasFile ? "Um arquivo já está anexado a esta conversa." : "Anexar arquivo"}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              disabled={isLoading}
            >
              <Mic className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Sujeito aos Termos de uso 3A RIVA e à Política de Privacidade da 3A RIVA. O modelo Bob 1.0 pode cometer erros. Por isso, é bom checar as respostas.
        </p>
      </form>
    </div>
  );
}
