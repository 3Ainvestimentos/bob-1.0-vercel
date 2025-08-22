
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractDataFromXpReport } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, FileText, Loader2, Wand2, AlertTriangle, Building, BarChart, TrendingUp, TrendingDown, Star, MessageSquareQuote, CalendarDays } from 'lucide-react';
import { Separator } from '../ui/separator';

interface PromptBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromptGenerated: (prompt: string) => void;
}

type ExtractedData = {
    reportMonth: string;
    monthlyReturn: string;
    monthlyCdi: string;
    monthlyGain: string;
    yearlyReturn: string;
    yearlyCdi: string;
    yearlyGain: string;
    highlights: { asset: string; return: string; reason: string }[];
    detractors: { asset: string; return: string }[];
};

type SelectedFields = {
    [key in keyof ExtractedData]?: boolean | { [index: number]: boolean };
};


export function PromptBuilderDialog({ open, onOpenChange, onPromptGenerated }: PromptBuilderDialogProps) {
  const [phase, setPhase] = useState<'upload' | 'loading' | 'selection' | 'error'>('upload');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedFields, setSelectedFields] = useState<SelectedFields>({});
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const resetState = () => {
    setPhase('upload');
    setExtractedData(null);
    setSelectedFields({});
    setError(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        toast({
            variant: 'destructive',
            title: 'Formato Inválido',
            description: 'Por favor, selecione um arquivo PDF.',
        });
        return;
    }

    setPhase('loading');
    
    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const fileDataUri = reader.result as string;
            const result = await extractDataFromXpReport({ name: file.name, mimeType: file.type, dataUri: fileDataUri });

            if (!result.success || !result.data) {
                throw new Error(result.error || "A extração de dados falhou.");
            }
            
            setExtractedData(result.data);
            setPhase('selection');
        };
        reader.onerror = () => {
            throw new Error("Não foi possível ler o arquivo.");
        };
    } catch (err: any) {
        setError(err.message);
        setPhase('error');
    }
  };

  const handleCheckboxChange = (category: keyof ExtractedData, index: number | null = null, checked: boolean) => {
    setSelectedFields(prev => {
        const newSelected = { ...prev };
        if (index !== null) {
            if (typeof newSelected[category] !== 'object') {
                newSelected[category] = {};
            }
            // @ts-ignore
            newSelected[category][index] = checked;
        } else {
            newSelected[category] = checked;
        }
        return newSelected;
    });
  };

  const handleGeneratePrompt = () => {
    if (!extractedData) return;

    let promptParts: string[] = [];
    promptParts.push(`Com base nos seguintes dados do mês de ${extractedData.reportMonth}, extraídos de um relatório de performance da XP:`);

    if (selectedFields.monthlyReturn) promptParts.push(`- Rentabilidade do Mês: ${extractedData.monthlyReturn}`);
    if (selectedFields.monthlyCdi) promptParts.push(`- Performance vs. CDI no Mês: ${extractedData.monthlyCdi}`);
    if (selectedFields.monthlyGain) promptParts.push(`- Ganho Financeiro no Mês: ${extractedData.monthlyGain}`);
    if (selectedFields.yearlyReturn) promptParts.push(`- Rentabilidade do Ano: ${extractedData.yearlyReturn}`);
    if (selectedFields.yearlyCdi) promptParts.push(`- Performance vs. CDI no Ano: ${extractedData.yearlyCdi}`);
    if (selectedFields.yearlyGain) promptParts.push(`- Ganho Financeiro no Ano: ${extractedData.yearlyGain}`);

    const selectedHighlights = extractedData.highlights.filter((_, i) => selectedFields.highlights && (selectedFields.highlights as any)[i]);
    if (selectedHighlights.length > 0) {
        promptParts.push("\nPrincipais destaques positivos:");
        selectedHighlights.forEach(h => promptParts.push(`- Ativo: ${h.asset}, Retorno: ${h.return}, Motivo: ${h.reason}`));
    }
    
    const selectedDetractors = extractedData.detractors.filter((_, i) => selectedFields.detractors && (selectedFields.detractors as any)[i]);
    if (selectedDetractors.length > 0) {
        promptParts.push("\nPrincipais detratores (ativos com performance abaixo do CDI):");
        selectedDetractors.forEach(d => promptParts.push(`- Ativo: ${d.asset}, Retorno: ${d.return}`));
    }
    
    promptParts.push(`\n\nGere uma mensagem amigável e profissional para o cliente, no padrão de comunicação da 3A RIVA, resumindo os pontos selecionados e adicionando uma breve análise sobre o cenário econômico atual para contextualizar a performance.`);
    
    onPromptGenerated(promptParts.join('\n'));
    handleClose();
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Wand2 className="h-6 w-6 text-primary" />
            <DialogTitle className="text-xl">Assistente de Prompt Estruturado</DialogTitle>
          </div>
          <DialogDescription>
            Anexe um relatório de performance da XP para extrair os dados e construir uma análise personalizada.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
            {phase === 'upload' && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 text-center h-full">
                    <UploadCloud className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg text-foreground">Anexar Relatório de Performance</h3>
                    <p className="text-muted-foreground text-sm mb-6">Arraste e solte o arquivo PDF aqui ou clique para selecionar.</p>
                    <Button type="button" onClick={() => document.getElementById('file-upload-prompt-builder')?.click()}>
                        <FileText className="mr-2 h-4 w-4" />
                        Selecionar Arquivo PDF
                    </Button>
                    <input id="file-upload-prompt-builder" type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                </div>
            )}
            
            {phase === 'loading' && (
                <div className="flex flex-col items-center justify-center text-center h-full">
                    <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
                    <h3 className="font-semibold text-lg text-foreground">Analisando Relatório...</h3>
                    <p className="text-muted-foreground text-sm">Aguarde, estamos extraindo os dados do seu documento.</p>
                </div>
            )}
            
            {phase === 'error' && (
                 <div className="flex flex-col items-center justify-center border-2 border-dashed border-destructive/50 rounded-xl p-12 text-center h-full bg-destructive/5">
                    <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
                    <h3 className="font-semibold text-lg text-destructive">Falha na Extração</h3>
                    <p className="text-destructive/80 text-sm mb-6">{error}</p>
                    <Button type="button" variant="destructive" onClick={resetState}>
                        Tentar Novamente
                    </Button>
                </div>
            )}

            {phase === 'selection' && extractedData && (
                <div className="space-y-6">
                    {extractedData.reportMonth && (
                        <div className="flex items-center gap-2 text-muted-foreground bg-muted p-3 rounded-lg">
                            <CalendarDays className="h-5 w-5" />
                            <h3 className="text-base font-semibold text-foreground">
                                Selecione os dados para a análise de <span className="text-primary">{extractedData.reportMonth}</span>
                            </h3>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base"><BarChart className="h-5 w-5 text-primary" />Resultados do Mês</CardTitle>
                             </CardHeader>
                             <CardContent className="space-y-4 text-sm">
                                <div className="flex items-center space-x-3"><Checkbox id="monthlyReturn" onCheckedChange={(c) => handleCheckboxChange('monthlyReturn', null, !!c)} /><Label htmlFor="monthlyReturn">Rentabilidade: <strong>{extractedData.monthlyReturn}</strong></Label></div>
                                <div className="flex items-center space-x-3"><Checkbox id="monthlyCdi" onCheckedChange={(c) => handleCheckboxChange('monthlyCdi', null, !!c)} /><Label htmlFor="monthlyCdi">% CDI: <strong>{extractedData.monthlyCdi}</strong></Label></div>
                                <div className="flex items-center space-x-3"><Checkbox id="monthlyGain" onCheckedChange={(c) => handleCheckboxChange('monthlyGain', null, !!c)} /><Label htmlFor="monthlyGain">Ganho Financeiro: <strong>{extractedData.monthlyGain}</strong></Label></div>
                             </CardContent>
                        </Card>
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-primary" />Resultados do Ano</CardTitle>
                             </CardHeader>
                             <CardContent className="space-y-4 text-sm">
                                <div className="flex items-center space-x-3"><Checkbox id="yearlyReturn" onCheckedChange={(c) => handleCheckboxChange('yearlyReturn', null, !!c)} /><Label htmlFor="yearlyReturn">Rentabilidade: <strong>{extractedData.yearlyReturn}</strong></Label></div>
                                <div className="flex items-center space-x-3"><Checkbox id="yearlyCdi" onCheckedChange={(c) => handleCheckboxChange('yearlyCdi', null, !!c)} /><Label htmlFor="yearlyCdi">% CDI: <strong>{extractedData.yearlyCdi}</strong></Label></div>
                                <div className="flex items-center space-x-3"><Checkbox id="yearlyGain" onCheckedChange={(c) => handleCheckboxChange('yearlyGain', null, !!c)} /><Label htmlFor="yearlyGain">Ganho Financeiro: <strong>{extractedData.yearlyGain}</strong></Label></div>
                             </CardContent>
                        </Card>
                    </div>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base"><Star className="h-5 w-5 text-primary" />Destaques da Carteira</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                            <div className="space-y-3">
                               <h4 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-500" />Maiores Retornos</h4>
                               {extractedData.highlights.map((item, index) => (
                                   <div key={`h-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                       <Checkbox id={`h-${index}`} onCheckedChange={(c) => handleCheckboxChange('highlights', index, !!c)} className="mt-1" />
                                       <Label htmlFor={`h-${index}`} className="flex flex-col">
                                            <span><strong>{item.asset}</strong> ({item.return})</span>
                                            <span className="text-xs text-muted-foreground italic">"{item.reason}"</span>
                                        </Label>
                                   </div>
                               ))}
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" />Performance Inferior ao CDI</h4>
                               {extractedData.detractors.map((item, index) => (
                                   <div key={`d-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                       <Checkbox id={`d-${index}`} onCheckedChange={(c) => handleCheckboxChange('detractors', index, !!c)} className="mt-1" />
                                       <Label htmlFor={`d-${index}`}><strong>{item.asset}</strong> ({item.return})</Label>
                                   </div>
                               ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button type="button" onClick={handleGeneratePrompt} disabled={phase !== 'selection' || Object.keys(selectedFields).length === 0}>
             <MessageSquareQuote className="mr-2 h-4 w-4" />
             Gerar Prompt e Usar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
