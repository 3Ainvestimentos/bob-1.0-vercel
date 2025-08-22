
'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractDataFromXpReport } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, FileText, Loader2, Wand2, AlertTriangle, MessageSquareQuote, CalendarDays, BarChart, TrendingUp, TrendingDown, Star, X } from 'lucide-react';
import type { ChangeEvent, DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

// ---- Types ----

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

type PromptBuilderPhase = 'upload' | 'loading' | 'selection' | 'error';

interface PromptBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromptGenerated: (prompt: string) => void;
  onFileDrop: () => void;
}

// ---- Sub-components for each phase ----

const UploadPhase = ({ onFilesChange, setReportType, setAnalysisType }: { onFilesChange: (files: File[]) => void; setReportType: (value: string) => void; setAnalysisType: (value: string) => void; }) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const handleFileChange = (newFiles: FileList) => {
        const pdfFiles = Array.from(newFiles).filter(file => file.type === 'application/pdf');
        setSelectedFiles(prev => {
            const existingFileNames = new Set(prev.map(f => f.name));
            const uniqueNewFiles = pdfFiles.filter(f => !existingFileNames.has(f.name));
            return [...prev, ...uniqueNewFiles];
        });
    };

    const handleLocalDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
           handleFileChange(e.target.files);
        }
    };
    
    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleContinue = () => {
        if (selectedFiles.length > 0) {
            onFilesChange(selectedFiles);
        }
    };

    const handleRemoveFile = (fileToRemove: File) => {
        setSelectedFiles(currentFiles => currentFiles.filter(file => file !== fileToRemove));
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <div 
                className={cn("flex flex-col border-2 border-dashed border-muted-foreground/30 rounded-xl p-6 text-center h-full transition-colors",
                    isDraggingOver && "border-primary bg-primary/10"
                )}
                onDrop={handleLocalDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                {selectedFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <UploadCloud className="h-16 w-16 text-muted-foreground/50 mb-4" />
                        <h3 className="font-semibold text-lg text-foreground">Anexar Relatório de Performance</h3>
                        <p className="text-muted-foreground text-sm mb-6">Arraste e solte o arquivo PDF aqui ou clique para selecionar.</p>
                        <Button type="button" onClick={() => document.getElementById('file-upload-prompt-builder')?.click()}>
                            <FileText className="mr-2 h-4 w-4" />
                            Selecionar Arquivo PDF
                        </Button>
                        <input id="file-upload-prompt-builder" type="file" accept=".pdf" className="hidden" onChange={handleFileInputChange} multiple />
                    </div>
                ) : (
                    <div className="flex flex-col h-full w-full">
                         <h3 className="font-semibold text-lg text-left text-foreground mb-4">Arquivos Anexados ({selectedFiles.length})</h3>
                         <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                            {selectedFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between bg-muted p-2 rounded-lg text-sm">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <FileText className="h-5 w-5 text-primary shrink-0" />
                                        <span className="font-medium text-foreground truncate">{file.name}</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleRemoveFile(file)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                         </div>
                         <Button variant="outline" size="sm" className="mt-4" onClick={() => document.getElementById('file-upload-prompt-builder')?.click()}>Adicionar outro arquivo</Button>
                    </div>
                )}
            </div>
            <div className="space-y-6 flex flex-col justify-between">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="report-type" className="font-semibold">Relatórios Disponíveis</Label>
                        <Select defaultValue="performance" onValueChange={setReportType}>
                            <SelectTrigger id="report-type" className="mt-2">
                                <SelectValue placeholder="Selecione o relatório" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="performance">Relatório de Performance</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="analysis-type" className="font-semibold">Quantidade de Itens</Label>
                        <Select defaultValue="individual" onValueChange={setAnalysisType}>
                            <SelectTrigger id="analysis-type" className="mt-2">
                                <SelectValue placeholder="Selecione a quantidade" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="individual">Individual</SelectItem>
                                <SelectItem value="batch" disabled>Lote (em breve)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button type="button" onClick={handleContinue} disabled={selectedFiles.length === 0}>
                    Continuar e Processar
                </Button>
            </div>
        </div>
    );
};


const LoadingPhase = () => (
    <div className="flex flex-col items-center justify-center text-center h-full">
        <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
        <h3 className="font-semibold text-lg text-foreground">Analisando Relatório...</h3>
        <p className="text-muted-foreground text-sm">Aguarde, estamos extraindo os dados do seu documento.</p>
    </div>
);

const ErrorPhase = ({ error, onRetry }: { error: string | null, onRetry: () => void }) => (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-destructive/50 rounded-xl p-12 text-center h-full bg-destructive/5">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h3 className="font-semibold text-lg text-destructive">Falha na Extração</h3>
        <p className="text-destructive/80 text-sm mb-6">{error}</p>
        <Button type="button" variant="destructive" onClick={onRetry}>
            Tentar Novamente
        </Button>
    </div>
);

const SelectionPhase = ({ data, onCheckboxChange }: { data: ExtractedData, onCheckboxChange: (category: keyof ExtractedData, index: number | null, checked: boolean) => void }) => {
    
    const parseReturn = (returnStr: string): number => {
        if (!returnStr) return -Infinity;
        return parseFloat(returnStr.replace('%', '').replace(',', '.').trim());
    };

    const sortedHighlights = [...data.highlights].sort((a, b) => parseReturn(b.return) - parseReturn(a.return));

    return (
    <div className="space-y-6">
        {data.reportMonth && (
            <div className="flex items-center gap-2 text-muted-foreground bg-muted p-3 rounded-lg">
                <CalendarDays className="h-5 w-5" style={{ color: '#DFB87F' }} />
                <h3 className="text-base font-semibold text-foreground">
                    Selecione os dados para a análise de <span style={{ color: '#DFB87F' }}>{data.reportMonth}</span>
                </h3>
            </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><BarChart className="h-5 w-5" style={{ color: '#DFB87F' }} />Resultados do Mês</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyReturn" onCheckedChange={(c) => onCheckboxChange('monthlyReturn', null, !!c)} /><Label htmlFor="monthlyReturn">Rentabilidade: <strong>{data.monthlyReturn}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyCdi" onCheckedChange={(c) => onCheckboxChange('monthlyCdi', null, !!c)} /><Label htmlFor="monthlyCdi">% CDI: <strong>{data.monthlyCdi}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyGain" onCheckedChange={(c) => onCheckboxChange('monthlyGain', null, !!c)} /><Label htmlFor="monthlyGain">Ganho Financeiro: <strong>{data.monthlyGain}</strong></Label></div>
                 </CardContent>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5" style={{ color: '#DFB87F' }} />Resultados do Ano</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyReturn" onCheckedChange={(c) => onCheckboxChange('yearlyReturn', null, !!c)} /><Label htmlFor="yearlyReturn">Rentabilidade: <strong>{data.yearlyReturn}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyCdi" onCheckedChange={(c) => onCheckboxChange('yearlyCdi', null, !!c)} /><Label htmlFor="yearlyCdi">% CDI: <strong>{data.yearlyCdi}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyGain" onCheckedChange={(c) => onCheckboxChange('yearlyGain', null, !!c)} /><Label htmlFor="yearlyGain">Ganho Financeiro: <strong>{data.yearlyGain}</strong></Label></div>
                 </CardContent>
            </Card>
        </div>
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Star className="h-5 w-5" style={{ color: '#DFB87F' }} />Destaques Mensais da carteira</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div className="space-y-3">
                   <h4 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-500" />Maiores Retornos</h4>
                   {sortedHighlights.map((item, index) => (
                       <div key={`h-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                           <Checkbox id={`h-${index}`} onCheckedChange={(c) => onCheckboxChange('highlights', index, !!c)} className="mt-1" />
                           <Label htmlFor={`h-${index}`} className="flex flex-col">
                                <span><strong>{item.asset}</strong> ({item.return})</span>
                                <span className="text-xs text-muted-foreground italic">"{item.reason}"</span>
                            </Label>
                       </div>
                   ))}
                </div>
                <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" />Performance Inferior ao CDI</h4>
                   {data.detractors.map((item, index) => (
                       <div key={`d-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                           <Checkbox id={`d-${index}`} onCheckedChange={(c) => onCheckboxChange('detractors', index, !!c)} className="mt-1" />
                           <Label htmlFor={`d-${index}`}><strong>{item.asset}</strong> ({item.return})</Label>
                       </div>
                   ))}
                </div>
            </CardContent>
        </Card>
    </div>
    );
};


export function PromptBuilderDialog({ open, onOpenChange, onPromptGenerated, onFileDrop }: PromptBuilderDialogProps) {
  const [phase, setPhase] = useState<PromptBuilderPhase>('upload');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedFields, setSelectedFields] = useState<SelectedFields>({});
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [reportType, setReportType] = useState('performance');
  const [analysisType, setAnalysisType] = useState('individual');


  const resetState = () => {
    setPhase('upload');
    setExtractedData(null);
    setSelectedFields({});
    setError(null);
  };
  
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0]; // For now, only process the first file for individual analysis

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
  }

  const handleFilesChange = (files: File[]) => {
    if (files.length === 0) return;
    onFileDrop(); // Notify parent to reset its dragging state
    processFiles(files);
  };

  const handleCheckboxChange = (category: keyof ExtractedData, index: number | null = null, checked: boolean) => {
    setSelectedFields(prev => {
        const newSelected = { ...prev };
        if (index !== null) {
            // @ts-ignore
            const categoryState = newSelected[category] && typeof newSelected[category] === 'object' ? newSelected[category] : {};
            // @ts-ignore
            categoryState[index] = checked;
            newSelected[category] = categoryState;
        } else {
            newSelected[category] = checked;
        }
        return newSelected;
    });
  };

  const handleGeneratePrompt = () => {
    if (!extractedData) return;

    let prompt = `Você é um especialista em finanças. Sua tarefa é usar os dados extraídos de um relatório de investimentos da XP para formatar uma mensagem para WhatsApp, seguindo um modelo específico.

**REGRAS ESTRITAS:**
1.  **Use os dados fornecidos** para preencher os placeholders no modelo de mensagem.
2.  **Mantenha a formatação EXATA** do modelo, incluindo quebras de linha e asteriscos para negrito.
3.  **Não inclua** \`\`\`, Markdown, ou qualquer outra formatação que não seja a do modelo.
4.  **Adicione um parágrafo final** com uma análise do cenário econômico para contextualizar a performance.
5.  **Substitua o placeholder [NOME]** pelo nome do cliente (você pode deixar como está se não for fornecido).

---
**DADOS EXTRAÍDOS PARA USO:**
- **Mês de Referência:** ${extractedData.reportMonth}`;

    if (selectedFields.monthlyReturn) prompt += `\n- **Rentabilidade Percentual do Mês:** ${extractedData.monthlyReturn}`;
    if (selectedFields.monthlyCdi) prompt += `\n- **Rentabilidade em %CDI do Mês:** ${extractedData.monthlyCdi}`;
    if (selectedFields.monthlyGain) prompt += `\n- **Ganho Financeiro do Mês:** ${extractedData.monthlyGain}`;
    if (selectedFields.yearlyReturn) prompt += `\n- **Rentabilidade Percentual do Ano:** ${extractedData.yearlyReturn}`;
    if (selectedFields.yearlyCdi) prompt += `\n- **Rentabilidade em %CDI do Ano:** ${extractedData.yearlyCdi}`;
    if (selectedFields.yearlyGain) prompt += `\n- **Ganho Financeiro do Ano:** ${extractedData.yearlyGain}`;

    const selectedHighlights = extractedData.highlights.filter((_, i) => selectedFields.highlights && (selectedFields.highlights as any)[i]);
    if (selectedHighlights.length > 0) {
        prompt += "\n- **Principais Destaques Positivos:**";
        selectedHighlights.forEach(h => {
            prompt += `\n  - Classe: ${h.asset}, Rentabilidade: ${h.return}, Justificativa: ${h.reason}`;
        });
    }

    const selectedDetractors = extractedData.detractors.filter((_, i) => selectedFields.detractors && (selectedFields.detractors as any)[i]);
    if (selectedDetractors.length > 0) {
        prompt += "\n- **Principais Detratores:**";
        selectedDetractors.forEach(d => {
            prompt += `\n  - Classe: ${d.asset}, Rentabilidade: ${d.return}`;
        });
    }

    prompt += `
---
**MODELO OBRIGATÓRIO DA MENSAGEM (PREENCHA COM OS DADOS ACIMA):**

Olá, [NOME]!
Em ${extractedData.reportMonth} sua carteira rendeu *${selectedFields.monthlyReturn ? extractedData.monthlyReturn : '[RENTABILIDADE PERCENTUAL DO MÊS]'}*, o que equivale a *${selectedFields.monthlyCdi ? extractedData.monthlyCdi : '[RENTABILIDADE EM %CDI DO MÊS]'}*, um ganho bruto de *${selectedFields.monthlyGain ? extractedData.monthlyGain : '[GANHO FINANCEIRO DO MÊS]'}*! No ano, estamos com uma rentabilidade de *${selectedFields.yearlyReturn ? extractedData.yearlyReturn : '[RENTABILIDADE PERCENTUAL DO ANO]'}*, o que equivale a uma performance de *${selectedFields.yearlyCdi ? extractedData.yearlyCdi : '[RENTABILIDADE EM %CDI DO ANO]'}* e um ganho financeiro de *${selectedFields.yearlyGain ? extractedData.yearlyGain : '[GANHO FINANCEIRO DO ANO]'}*!

Os principais destaques foram:
${selectedHighlights.length > 0 ? selectedHighlights.map(h => `*${h.asset}*, com *${h.return}*, *${h.reason}*`).join('\n') : '*[Classe 1]*, com *[rentabilidade]*, *[justificativa]*\n*[Classe 2]*, com *[rentabilidade]*, *[justificativa]*'}

Os principais detratores foram:
${selectedDetractors.length > 0 ? selectedDetractors.map(d => `*${d.asset}*: *${d.return}*`).join('\n') : '*[Classe 1]*: *[rentabilidade]*\n*[Classe 2]*: *[rentabilidade]*'}

[INSIRA AQUI O PARÁGRAFO DE ANÁLISE DO CENÁRIO ECONÔMICO]
`;
    
    onPromptGenerated(prompt);
    handleClose();
  };


  const handleClose = () => {
    resetState();
    onOpenChange(false);
  }
  
  const renderContent = () => {
    switch (phase) {
        case 'upload':
            return <UploadPhase onFilesChange={handleFilesChange} setReportType={setReportType} setAnalysisType={setAnalysisType} />;
        case 'loading':
            return <LoadingPhase />;
        case 'error':
            return <ErrorPhase error={error} onRetry={resetState} />;
        case 'selection':
            if (extractedData) {
                return <SelectionPhase data={extractedData} onCheckboxChange={handleCheckboxChange} />;
            }
            return <ErrorPhase error="Não foi possível exibir os dados extraídos." onRetry={resetState} />;
        default:
            return null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); else onOpenChange(true); }}>
      <DialogContent 
        className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0"
        onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
      >
        <DialogHeader className='p-6 pb-4 border-b shrink-0'>
          <div className="flex items-center gap-3">
            <Wand2 className="h-6 w-6" style={{ color: '#DFB87F' }} />
            <DialogTitle className="text-xl">Assistente de Prompt Estruturado</DialogTitle>
          </div>
          <DialogDescription>
            Anexe um relatório de performance da XP para extrair os dados e construir uma análise personalizada.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
            {renderContent()}
        </div>

        {phase === 'selection' && (
            <DialogFooter className="p-6 pt-4 border-t mt-auto bg-background sticky bottom-0">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="button" onClick={handleGeneratePrompt} disabled={phase !== 'selection' || Object.values(selectedFields).every(v => typeof v === 'boolean' ? !v : Object.values(v).every(subV => !subV))}>
                    <MessageSquareQuote className="mr-2 h-4 w-4" />
                    Gerar Prompt e Usar
                </Button>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
