// src/components/chat/UpdateNotesDialog.tsx

'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Rocket, Sparkles, CheckCircle } from 'lucide-react';
import Image from 'next/image';

interface UpdateNotes {
  title: string;
  features: string[];
  fixes: string[];
  imageUrl?: string;
}

export const updateDetails: UpdateNotes = {
  title: "Novidades e Melhorias no Bob!",
  imageUrl:"/images/caixasSelecionadasRelatorioXp.jpeg",
  features: [
    "Análise Ultra-Lote já está disponivel",
    "Uma pasta com até 100 arquivos",
    
  ],
  fixes: [
    "Correção pontual aplicada no analisador de relatório",
    "Para a análise ser completa, lembre-se de extrair o Relatório XP com todas as caixas selecionadas:"
  ]
};

interface UpdateNotesDialogProps {
  open: boolean;
  onAcknowledge: () => void;
}

export function UpdateNotesDialog({ open, onAcknowledge }: UpdateNotesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onAcknowledge(); }}>
      <DialogContent className="sm:max-w-lg !rounded-xl overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <DialogTitle className="text-xl">{updateDetails.title}</DialogTitle>
          </div>
          <DialogDescription>
            Fizemos algumas atualizações para melhorar sua experiência. Confira as novidades:
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4 text-sm max-h-[60vh] overflow-y-auto pr-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-gray-500" />
              Novas Funcionalidades e Melhorias
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {updateDetails.features.map((feature, index) => (
                <li key={`feature-${index}`}>{feature}</li>
              ))}
            </ul>
          </div>

          {updateDetails.fixes.length > 0 && (
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-gray-500" />
                Atenção
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {updateDetails.fixes.map((fix, index) => (
                  <li key={`fix-${index}`}>{fix}</li>
                ))}
              </ul>

              {/* Imagem abaixo do tópico Atenção */}
              {updateDetails.imageUrl && (
                <div className="w-full mt-4 mb-2 rounded-lg overflow-hidden border border-gray-200">
                  <div className="relative w-full h-60 bg-gray-50">
                    <Image
                      src={updateDetails.imageUrl}
                      alt="Instruções para extrair relatório XPerformance - todas as caixas selecionadas"
                      fill
                      className="object-contain p-2"
                      sizes="(max-width: 768px) 100vw, 600px"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onAcknowledge}>Entendido!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}