
'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mic, Paperclip, SendHorizontal } from 'lucide-react';
import React, { FormEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

interface ChatInputFormProps {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: FormEvent) => void;
  isLoading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export function ChatInputForm({
  input,
  setInput,
  handleSubmit,
  isLoading,
  inputRef,
}: ChatInputFormProps) {
  return (
    <div className="sticky bottom-0 w-full bg-background/95 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-5xl px-4 pb-4 pt-2"
      >
        <div className="rounded-lg border bg-background shadow-sm">
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
              disabled={isLoading || !input.trim()}
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>
          <Separator />
          <div className="flex items-center p-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              disabled={isLoading}
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
