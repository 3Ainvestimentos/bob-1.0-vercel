
'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FaqDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const faqData = [
  {
    value: 'item-1',
    trigger: '1. Funcionalidades Essenciais da Conversa',
    content:
      'Explore como interagir com o assistente, usar o histórico, fornecer feedback sobre as respostas e muito mais para aproveitar ao máximo a ferramenta.',
  },
  {
    value: 'item-2',
    trigger: '2. Organização e Gerenciamento de Histórico',
    content:
      'Aprenda a criar projetos para agrupar conversas, renomear chats, movê-los entre projetos e arquivá-los para manter seu espaço de trabalho organizado.',
  },
  {
    value: 'item-3',
    trigger: '3. Experiência do Usuário e Suporte',
    content:
      'Descubra como personalizar a interface, alternar entre temas claro e escuro, e onde encontrar ajuda ou reportar problemas para a equipe de suporte.',
  },
];

export function FaqDialog({ open, onOpenChange }: FaqDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Guias e Perguntas Frequentes
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Accordion type="single" collapsible className="w-full">
            {faqData.map((item) => (
              <AccordionItem key={item.value} value={item.value}>
                <AccordionTrigger>{item.trigger}</AccordionTrigger>
                <AccordionContent>{item.content}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}
