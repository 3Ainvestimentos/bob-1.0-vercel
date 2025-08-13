
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
    value: 'item-bob-1',
    trigger: 'Como posso interagir com o Bob?',
    content: (
        <div className="space-y-4 text-muted-foreground">
            <p>Você pode fazer perguntas de três maneiras diferentes:</p>
            <div>
                <strong className="font-semibold text-foreground">a) Digitando sua Pergunta</strong>
                <p className="mt-1">É a forma mais simples. Apenas escreva o que você precisa no campo de texto e pressione "Enter".</p>
            </div>
            <div>
                <strong className="font-semibold text-foreground">b) Anexando um Arquivo</strong>
                <p className="mt-1">Clique no ícone de clipe de papel (📎), selecione um ou mais arquivos (PDF, Word, Excel) e, em seguida, faça uma pergunta sobre eles. Por exemplo: "Resuma este relatório".</p>
            </div>
            <div>
                <strong className="font-semibold text-foreground">c) Usando a Voz</strong>
                <p className="mt-1">Clique no ícone de microfone (🎤), fale sua pergunta de forma clara, e o sistema irá transcrevê-la para a caixa de texto, pronta para ser enviada.</p>
            </div>
        </div>
    )
  },
  {
    value: 'item-bob-2',
    trigger: 'O que posso perguntar ou pedir ao Bob?',
    content: (
        <div className="space-y-2 text-muted-foreground">
            <p>Você pode usar o Bob para diversas tarefas:</p>
            <ul className="list-disc space-y-1 pl-5">
                <li><span className="font-medium text-foreground">Tirar Dúvidas Gerais:</span> "Quem é o responsável pela área de compliance?".</li>
                <li><span className="font-medium text-foreground">Analisar Documentos:</span> Anexe um PDF e peça: "Resuma os pontos principais deste documento."</li>
                <li><span className="font-medium text-foreground">Extrair Dados de Planilhas:</span> Envie um arquivo Excel e pergunte: "Qual foi o total de vendas no último trimestre com base nesta planilha?".</li>
                <li><span className="font-medium text-foreground">Análise Padrão de Investimentos (Ação Especial):</span> Anexe um relatório de posição consolidada da XP e digite o comando: <strong className='text-foreground'>"faça a análise com nosso padrão"</strong>. Bob irá extrair os dados e montar uma mensagem formatada para o WhatsApp.</li>
                <li><span className="font-medium text-foreground">Buscar na Web:</span> Se a resposta não estiver na nossa base interna, Bob oferecerá a opção "Pesquisar na Web" para buscar informações externas.</li>
            </ul>
        </div>
    )
  },
    {
    value: 'item-bob-3',
    trigger: 'Como organizo minhas conversas?',
    content: (
        <div className="space-y-4 text-muted-foreground">
            <p>Para manter seu histórico organizado, você pode usar <strong className="text-foreground">Projetos</strong>, que funcionam como pastas.</p>
            <div>
                <strong className="font-semibold text-foreground">Criar um Projeto:</strong>
                <p className="mt-1">Na barra lateral, clique em "Novo projeto".</p>
            </div>
            <div>
                <strong className="font-semibold text-foreground">Mover uma Conversa:</strong>
                <p className="mt-1">Você pode <strong className="text-foreground">arrastar e soltar</strong> uma conversa de um lugar para outro. Alternativamente, clique nos três pontinhos (⋮) ao lado do nome da conversa para ver a opção "Mover para...".</p>
            </div>
            <div>
                <strong className="font-semibold text-foreground">Renomear ou Excluir:</strong>
                <p className="mt-1">Clique nos três pontinhos (⋮) ao lado do nome da conversa ou do projeto para encontrar as opções de renomear e excluir.</p>
            </div>
        </div>
    )
  },
  {
    value: 'item-bob-4',
    trigger: 'Quais ações posso realizar nas respostas do Bob?',
    content: (
        <div className="space-y-2 text-muted-foreground">
            <p>Para cada resposta que o Bob te dá, você tem várias opções:</p>
            <ul className="list-disc space-y-1 pl-5">
                <li><strong className="text-foreground">👍 / 👎 (Feedback):</strong> Use os ícones de polegar para nos dizer se a resposta foi útil ou não. Seu feedback é muito importante!</li>
                <li><strong className="text-foreground">🔄 (Gerar Novamente):</strong> Não gostou da resposta? Clique neste ícone para pedir ao Bob que tente novamente.</li>
                <li><strong className="text-foreground">📋 (Copiar):</strong> Copia o texto da resposta para sua área de transferência.</li>
                <li><strong className="text-foreground">🚨 (Informar Problema Jurídico):</strong> Se você identificar alguma informação na resposta que pareça sensível ou incorreta do ponto de vista legal, use esta opção para notificar a equipe de conformidade.</li>
            </ul>
        </div>
    )
  },
    {
    value: 'item-bob-5',
    trigger: 'Como posso obter melhores resultados?',
    content: (
        <div className="space-y-2 text-muted-foreground">
             <ul className="list-disc space-y-1 pl-5">
                <li><strong className="text-foreground">Seja Específico:</strong> Quanto mais clara e detalhada for a sua pergunta, melhor será a resposta do Bob.</li>
                <li><strong className="text-foreground">Use Palavras-Chave:</strong> Para tarefas específicas, como a análise de relatórios, use os comandos exatos (ex: "análise com nosso padrão").</li>
                <li><strong className="text-foreground">Forneça Contexto:</strong> Ao analisar um arquivo, diga ao Bob o que você procura. Em vez de apenas "Analise este arquivo", tente "Analise este arquivo e me diga quais foram os principais riscos apontados".</li>
            </ul>
             <p className="pt-2">Para qualquer dúvida ou problema não coberto por este guia, por favor, abra um chamado no <strong className="text-foreground">Connect</strong>.</p>
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
