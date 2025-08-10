
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
    content: (
        <div className="space-y-4">
            <div>
                <strong className="font-semibold">1.1. Interação com a IA</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Chat Conversacional:</span> Interface de chat intuitiva para fazer perguntas em linguagem natural.</li>
                    <li><span className="font-medium text-foreground">Envio de Arquivos (Multimodalidade):</span> Anexe arquivos (Documentos, Imagens, Áudio, Vídeo) diretamente na conversa para análise.</li>
                    <li><span className="font-medium text-foreground">Entrada por Voz:</span> Utilize o microfone para ditar suas perguntas. O áudio é transcrito e processado automaticamente.</li>
                    <li><span className="font-medium text-foreground">Memória de Contexto:</span> O Bob mantém o contexto da conversa atual, permitindo perguntas de acompanhamento.</li>
                </ul>
            </div>
            <div>
                <strong className="font-semibold">1.2. Capacidades do Modelo de IA</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Troca de Modelos:</span> Escolha entre Bob 1.0 Flash (rápido) e Bob 1.0 Pro (raciocínio complexo).</li>
                    <li><span className="font-medium text-foreground">Busca na Web (Simulada):</span> Para perguntas que exigem informações recentes, o Bob pode simular uma busca na web.</li>
                    <li><span className="font-medium text-foreground">Citação de Fontes:</span> Quando uma busca é realizada, as respostas incluem os links das fontes utilizadas.</li>
                </ul>
            </div>
            <div>
                <strong className="font-semibold">1.3. Interação com as Respostas</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Gerar Novamente:</span> Peça para o Bob tentar uma nova resposta com um clique.</li>
                    <li><span className="font-medium text-foreground">Excluir Última Geração:</span> Remova a última resposta da IA e o seu prompt correspondente.</li>
                    <li><span className="font-medium text-foreground">Feedback:</span> Avalie as respostas com "gostei" ou "não gostei".</li>
                    <li><span className="font-medium text-foreground">Copiar e Compartilhar:</span> Copie o texto de uma única resposta ou de uma conversa inteira.</li>
                    <li><span className="font-medium text-foreground">Contagem de Tokens:</span> Exibe a quantidade de tokens usados para gerar a resposta.</li>
                    <li><span className="font-medium text-foreground">Reportar Problema:</span> Sinalize respostas com possíveis problemas jurídicos ou de conformidade.</li>
                </ul>
            </div>
        </div>
    )
  },
  {
    value: 'item-2',
    trigger: '2. Organização e Gerenciamento de Histórico',
    content: (
        <div className="space-y-4">
            <div>
                <strong className="font-semibold">2.1. Projetos (Pastas)</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Criação de Projetos:</span> Organize seus chats em "Projetos" para agrupar conversas por tema.</li>
                    <li><span className="font-medium text-foreground">Gerenciamento de Projetos:</span> Renomeie e exclua projetos. Ao excluir um projeto, as conversas são mantidas como avulsas.</li>
                    <li><span className="font-medium text-foreground">Destino para Novos Chats:</span> Defina um projeto como destino padrão para novas conversas.</li>
                </ul>
            </div>
            <div>
                <strong className="font-semibold">2.2. Gerenciamento de Conversas</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Mover entre Projetos:</span> Mova conversas para um projeto ou remova-as de um.</li>
                    <li><span className="font-medium text-foreground">Exclusão de Conversas:</span> Exclua conversas individuais.</li>
                    <li><span className="font-medium text-foreground">Persistência Local:</span> O histórico é salvo no seu navegador (localStorage), garantindo privacidade, mas não sincroniza entre dispositivos.</li>
                </ul>
            </div>
        </div>
    )
  },
  {
    value: 'item-3',
    trigger: '3. Experiência do Usuário e Suporte',
    content: (
        <div className="space-y-4">
            <div>
                <strong className="font-semibold">3.1. Assistência Proativa</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Insights Proativos:</span> O Bob oferece sugestões e insights contextuais que aparecem de forma discreta no cabeçalho.</li>
                    <li><span className="font-medium text-foreground">Sugestões de Prompt:</span> Na tela inicial, o Bob apresenta sugestões de prompts para inspirar o usuário.</li>
                </ul>
            </div>
            <div>
                <strong className="font-semibold">3.2. Personalização e Ajuda</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Temas:</span> Escolha entre os temas Claro (Light), Escuro (Dark), ou sincronize com o Sistema Operacional.</li>
                    <li><span className="font-medium text-foreground">Guias e FAQ:</span> Esta seção de ajuda explica todas as funcionalidades.</li>
                </ul>
            </div>
        </div>
    )
  },
  {
    value: 'item-4',
    trigger: '4. Suporte e Resolução de Problemas',
    content: (
        <div className="space-y-4">
            <div>
                <strong className="font-semibold">4.1. Canal de Suporte</strong>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Abertura de Tickets:</span> Caso encontre qualquer problema técnico, comportamento inesperado ou tenha alguma dúvida que não foi respondida aqui, por favor, abra um ticket de suporte através da aplicação "Connect".</li>
                </ul>
            </div>
        </div>
    )
  },
];

export function FaqDialog({ open, onOpenChange }: FaqDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col p-0 max-h-[80vh]">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold">
            Guias e Perguntas Frequentes
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto">
          <div className="px-6 pb-6">
            <Accordion type="single" collapsible className="w-full">
              {faqData.map((item) => (
                <AccordionItem key={item.value} value={item.value}>
                  <AccordionTrigger className="font-semibold hover:no-underline text-left">
                    {item.trigger}
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    {item.content}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
