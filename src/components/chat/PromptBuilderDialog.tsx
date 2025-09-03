
'use client';

import { useState, useMemo, ChangeEvent, DragEvent, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractDataFromXpReport } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, FileText, Loader2, Wand2, AlertTriangle, MessageSquareQuote, CalendarDays, BarChart, TrendingUp, TrendingDown, Star, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


// ---- Types ----

type Highlight = { asset: string; return: string; reason: string };
type Detractor = { asset: string; cdiPercentage: string };

type ExtractedData = {
    reportMonth: string;
    monthlyReturn: string;
    monthlyCdi: string;
    monthlyGain: string;
    yearlyReturn: string;
    yearlyCdi: string;
    yearlyGain: string;
    highlights: Record<string, Highlight[]>;
    detractors: Record<string, Detractor[]>;
};

type SelectedFields = {
    [key in keyof ExtractedData]?: boolean | { [category: string]: { [index: number]: boolean } };
};

type PromptBuilderPhase = 'upload' | 'loading' | 'selection' | 'error';
type AnalysisType = 'individual' | 'batch';
type PersonalizePrompt = 'yes' | 'no';

interface PromptBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromptGenerated: (prompt: string) => void;
  onBatchSubmit: (files: File[]) => void;
}

const BATCH_LIMIT = 5;

// ---- Sub-components for each phase ----

const UploadPhase = ({ onFilesChange, onBatchSubmit, files }: { onFilesChange: (files: File[]) => void; onBatchSubmit: (files: File[]) => void; files: File[] }) => {
    const { toast } = useToast();
    const [selectedFiles, setSelectedFiles] = useState<File[]>(files);
    const [analysisType, setAnalysisType] = useState<AnalysisType>('individual');
    const [personalize, setPersonalize] = useState<PersonalizePrompt>('yes');
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    useEffect(() => {
        if (selectedFiles.length > 1) {
            setAnalysisType('batch');
            setPersonalize('no');
        } else if (selectedFiles.length <= 1 && analysisType === 'batch') {
            setAnalysisType('individual');
        }
    }, [selectedFiles, analysisType]);

    const handleFileDrop = (droppedFiles: FileList) => {
        if (!droppedFiles) return;

        const pdfFiles = Array.from(droppedFiles).filter(file => file.type === 'application/pdf');
        
        setSelectedFiles(prev => {
            const totalFiles = prev.length + pdfFiles.length;
            if (totalFiles > BATCH_LIMIT && prev.length < BATCH_LIMIT) {
                toast({
                    title: 'Limite de Arquivos Atingido',
                    description: `Você só pode analisar ${BATCH_LIMIT} relatórios por vez. Apenas os primeiros arquivos foram adicionados.`,
                    variant: 'default',
                });
            } else if (prev.length >= BATCH_LIMIT) {
                toast({
                    title: 'Limite de Arquivos Atingido',
                    description: `Você já atingiu o limite de ${BATCH_LIMIT} relatórios.`,
                    variant: 'default',
                });
                return prev;
            }
            
            const existingFileNames = new Set(prev.map(f => f.name));
            const uniqueNewFiles = pdfFiles.filter(f => !existingFileNames.has(f.name));
            
            const filesToAdd = uniqueNewFiles.slice(0, BATCH_LIMIT - prev.length);

            return [...prev, ...filesToAdd];
        });
    }

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        handleFileDrop(e.dataTransfer.files);
    };
    
    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newFiles = e.target.files;
        if (!newFiles) return;
        handleFileDrop(newFiles);
        e.target.value = '';
    };
    
    const handleContinue = () => {
        if (selectedFiles.length === 0) return;

        if (personalize === 'yes' && analysisType === 'individual') {
            onFilesChange(selectedFiles);
        } else {
            onBatchSubmit(selectedFiles);
        }
    };

    const handleRemoveFile = (fileToRemove: File) => {
        setSelectedFiles(currentFiles => currentFiles.filter(file => file !== fileToRemove));
    };
    
    const isAddFileDisabled = selectedFiles.length >= BATCH_LIMIT;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <input id="prompt-builder-file-upload" type="file" accept=".pdf" className="hidden" onChange={handleFileInputChange} multiple disabled={isAddFileDisabled} />
            <div 
                className={cn(
                    "flex flex-col border-2 border-dashed border-muted-foreground/30 rounded-xl p-6 text-center h-full transition-colors",
                    isDraggingOver && 'border-primary bg-primary/10',
                    isAddFileDisabled && 'bg-muted/50 border-muted-foreground/10'
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {selectedFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <UploadCloud className="h-16 w-16 text-muted-foreground/50 mb-4" style={{ strokeWidth: 1.5 }} />
                        <h3 className="font-semibold text-lg text-foreground">Anexar Relatório de Performance</h3>
                        <p className="text-muted-foreground text-sm mb-6">Arraste e solte o arquivo PDF aqui ou clique para selecionar.</p>
                        <Button type="button" onClick={() => document.getElementById('prompt-builder-file-upload')?.click()}>
                            <FileText className="mr-2 h-4 w-4" />
                            Selecionar Arquivo PDF
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col h-full w-full">
                         <h3 className="font-semibold text-lg text-left text-foreground mb-4">Arquivos Anexados ({selectedFiles.length}/{BATCH_LIMIT})</h3>
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
                         <Button variant="outline" size="sm" className="mt-4" onClick={() => document.getElementById('prompt-builder-file-upload')?.click()} disabled={isAddFileDisabled}>Adicionar outro arquivo</Button>
                    </div>
                )}
            </div>
            <div className="space-y-6 flex flex-col justify-between">
            <TooltipProvider>
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Label htmlFor="report-type" className="font-semibold">Relatórios Disponíveis</Label>
                             <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Selecione o tipo de documento que será analisado.</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Select defaultValue="performance">
                            <SelectTrigger id="report-type">
                                <SelectValue placeholder="Selecione o relatório" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="performance">Relatório de Performance</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Label htmlFor="analysis-type" className="font-semibold">Quantidade de Itens</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Escolha entre analisar um único arquivo ou múltiplos em lote.</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Select value={analysisType} onValueChange={(value) => setAnalysisType(value as AnalysisType)} disabled={selectedFiles.length > 1}>
                            <SelectTrigger id="analysis-type">
                                <SelectValue placeholder="Selecione a quantidade" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="individual">Individual</SelectItem>
                                <SelectItem value="batch">Lote (Máximo {BATCH_LIMIT} volumes)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Label htmlFor="personalize-prompt" className="font-semibold">Personalizar Prompt</Label>
                             <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Selecione "Sim" para escolher os dados da análise ou "Não" para usar a mensagem automática.</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Select value={personalize} onValueChange={(value) => setPersonalize(value as PersonalizePrompt)} disabled={analysisType === 'batch'}>
                            <SelectTrigger id="personalize-prompt">
                                <SelectValue placeholder="Deseja personalizar?" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yes">Sim</SelectItem>
                                <SelectItem value="no">Não (usar mensagem automática)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </TooltipProvider>
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

const SelectionPhase = ({ data, onCheckboxChange }: { data: ExtractedData, onCheckboxChange: (category: keyof ExtractedData, assetClass: string, index: number, checked: boolean) => void }) => {
    
    const parseCdiPercentage = (cdiString: string): number => {
        if (typeof cdiString !== 'string') return NaN;
        
        const trimmedString = cdiString.trim();
        if (trimmedString === '(0,00)' || trimmedString === '00,00%') {
            return NaN;
        }

        const cleanedString = trimmedString.replace('%', '').replace('.', '').replace(',', '.');
        const value = parseFloat(cleanedString);
        return isNaN(value) ? NaN : value;
    };

    const renderHighlights = () => {
        const categories = Object.keys(data.highlights);
        if (categories.length === 0) return <p className="text-xs text-muted-foreground">Nenhum destaque positivo encontrado.</p>;

        return (
            <Accordion type="multiple" className="w-full">
                {categories.map(category => (
                    <AccordionItem value={`h-cat-${category}`} key={`h-cat-${category}`}>
                        <AccordionTrigger className="font-semibold text-muted-foreground text-xs uppercase tracking-wider hover:no-underline py-2">
                            {category} ({data.highlights[category].length})
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pl-1">
                            <div className="space-y-2">
                                {data.highlights[category].map((item, index) => (
                                    <div key={`h-${category}-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                        <Checkbox id={`h-${category}-${index}`} onCheckedChange={(c) => onCheckboxChange('highlights', category, index, !!c)} className="mt-1" />
                                        <Label htmlFor={`h-${category}-${index}`} className="flex flex-col">
                                            <span><strong>{item.asset}</strong> ({item.return})</span>
                                            <span className="text-xs text-muted-foreground italic">"{item.reason}"</span>
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        );
    };
    
    const renderDetractors = () => {
        const filteredAndSortedDetractors: Record<string, Detractor[]> = {};

        Object.entries(data.detractors).forEach(([category, items]) => {
            const processedItems = items
                .map(item => ({ ...item, numericCdi: parseCdiPercentage(item.cdiPercentage) }))
                .filter(item => !isNaN(item.numericCdi) && item.numericCdi < 100)
                .sort((a, b) => b.numericCdi - a.numericCdi);

            if (processedItems.length > 0) {
                filteredAndSortedDetractors[category] = processedItems;
            }
        });

        const categories = Object.keys(filteredAndSortedDetractors);
        if (categories.length === 0) return <p className="text-xs text-muted-foreground">Nenhum detrator com performance abaixo de 100% do CDI foi encontrado.</p>;

        return (
            <Accordion type="multiple" className="w-full">
                {categories.map(category => (
                    <AccordionItem value={`d-cat-${category}`} key={`d-cat-${category}`}>
                        <AccordionTrigger className="font-semibold text-muted-foreground text-xs uppercase tracking-wider hover:no-underline py-2">
                           {category} ({filteredAndSortedDetractors[category].length})
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pl-1">
                            <div className="space-y-2">
                                {filteredAndSortedDetractors[category].map((item, index) => (
                                    <div key={`d-${category}-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                        <Checkbox id={`d-${category}-${index}`} onCheckedChange={(c) => onCheckboxChange('detractors', category, index, !!c)} className="mt-1" />
                                        <Label htmlFor={`d-${category}-${index}`} className="cursor-pointer"><strong>{item.asset}</strong> ({item.cdiPercentage})</Label>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        );
    };

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
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyReturn" onCheckedChange={(c) => onCheckboxChange('monthlyReturn', '', -1, !!c)} /><Label htmlFor="monthlyReturn">Rentabilidade: <strong>{data.monthlyReturn}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyCdi" onCheckedChange={(c) => onCheckboxChange('monthlyCdi', '', -1, !!c)} /><Label htmlFor="monthlyCdi">% CDI: <strong>{data.monthlyCdi}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyGain" onCheckedChange={(c) => onCheckboxChange('monthlyGain', '', -1, !!c)} /><Label htmlFor="monthlyGain">Ganho Financeiro: <strong>{data.monthlyGain}</strong></Label></div>
                 </CardContent>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5" style={{ color: '#DFB87F' }} />Resultados do Ano</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyReturn" onCheckedChange={(c) => onCheckboxChange('yearlyReturn', '', -1, !!c)} /><Label htmlFor="yearlyReturn">Rentabilidade: <strong>{data.yearlyReturn}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyCdi" onCheckedChange={(c) => onCheckboxChange('yearlyCdi', '', -1, !!c)} /><Label htmlFor="yearlyCdi">% CDI: <strong>{data.yearlyCdi}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyGain" onCheckedChange={(c) => onCheckboxChange('yearlyGain', '', -1, !!c)} /><Label htmlFor="yearlyGain">Ganho Financeiro: <strong>{data.yearlyGain}</strong></Label></div>
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
                   {renderHighlights()}
                </div>
                <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" />Performance Inferior ao CDI</h4>
                    {renderDetractors()}
                </div>
            </CardContent>
        </Card>
    </div>
    );
};


export function PromptBuilderDialog({ open, onOpenChange, onPromptGenerated, onBatchSubmit }: PromptBuilderDialogProps) {
  const [phase, setPhase] = useState<PromptBuilderPhase>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedFields, setSelectedFields] = useState<SelectedFields>({});
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const resetState = () => {
    setPhase('upload');
    setUploadedFiles([]);
    setExtractedData(null);
    setSelectedFields({});
    setError(null);
  };
  
  const processIndividualFile = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];

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
    setUploadedFiles(files);
    processIndividualFile(files);
  };
  
  const handleBatchSubmit = (files: File[]) => {
    onBatchSubmit(files);
    handleClose();
  };

  const handleCheckboxChange = (category: keyof ExtractedData, assetClass: string, index: number, checked: boolean) => {
    setSelectedFields(prev => {
        const newSelected = { ...prev };
        if (index > -1) {
            const categoryState = (newSelected[category] as Record<string, Record<number, boolean>>) || {};
            if (!categoryState[assetClass]) {
                categoryState[assetClass] = {};
            }
            categoryState[assetClass][index] = checked;
            newSelected[category] = categoryState;
        } else {
            newSelected[category] = checked;
        }
        return newSelected;
    });
};


  const handleGeneratePrompt = () => {
    if (!extractedData) return;
    
    const economicScenarioText = `Em agosto de 2025, o Copom manteve a Selic em 15% a.a., sinalizando prudência diante das incertezas e preservando a âncora monetária. A leitura do IPCA-15 em deflação de 0,14% ajudou a reduzir a percepção de pressões de curto prazo, reforçando a decisão de estabilidade dos juros e melhorando o apetite ao risco doméstico. Nesse ambiente, o Ibovespa avançou 6,28% no mês e atingiu recorde nominal de 141.422 pontos, movimento sustentado por rotação para ativos de risco e pela leitura de que o ciclo de política monetária se encerrou com a inflação cedendo na margem.
No cenário externo, o Simpósio de Jackson Hole trouxe uma mensagem do Federal Reserve de vigilância ao mercado de trabalho, com ênfase em flexibilidade na condução da política — comunicação interpretada como ligeiramente “dovish”. Esse tom contribuiu para a melhora das condições financeiras globais e para a sustentação dos índices de ações, com o S&P 500 registrando alta de 1,9% no mês. O pano de fundo externo mais benigno, combinado ao alívio inflacionário local, criou um vetor positivo para ativos brasileiros, conectando a narrativa de juros estáveis, inflação mais comportada e valorização de bolsas no Brasil e nos Estados Unidos.`;

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

    
    const selectedHighlights: Highlight[] = [];
    if (selectedFields.highlights && typeof selectedFields.highlights === 'object') {
        for (const category in selectedFields.highlights) {
            for (const index in selectedFields.highlights[category]) {
                if (selectedFields.highlights[category][index]) {
                    selectedHighlights.push(extractedData.highlights[category][parseInt(index, 10)]);
                }
            }
        }
    }
    
    if (selectedHighlights.length > 0) {
        prompt += "\n- **Principais Destaques Positivos:**";
        selectedHighlights.forEach(h => {
            prompt += `\n  - Classe: ${h.asset}, Rentabilidade: ${h.return}, Justificativa: ${h.reason}`;
        });
    }

    const selectedDetractors: Detractor[] = [];
    if (selectedFields.detractors && typeof selectedFields.detractors === 'object') {
        for (const category in selectedFields.detractors) {
            for (const index in selectedFields.detractors[category]) {
                if (selectedFields.detractors[category][index]) {
                    selectedDetractors.push(extractedData.detractors[category][parseInt(index, 10)]);
                }
            }
        }
    }
    if (selectedDetractors.length > 0) {
        prompt += "\n- **Principais Detratores:**";
        selectedDetractors.forEach(d => {
            prompt += `\n  - Classe: ${d.asset}, % CDI: ${d.cdiPercentage}`;
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
${selectedDetractors.length > 0 ? selectedDetractors.map(d => `*${d.asset}*: *${d.cdiPercentage}*`).join('\n') : '*[Classe 1]*: *[rentabilidade]*\n*[Classe 2]*: *[rentabilidade]*'}

${economicScenarioText}
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
            return <UploadPhase onFilesChange={handleFilesChange} onBatchSubmit={handleBatchSubmit} files={uploadedFiles} />;
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
             <DialogFooter className="p-6 pt-4 border-t bg-background shrink-0">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="button" onClick={handleGeneratePrompt} disabled={phase !== 'selection' || Object.values(selectedFields).every(v => {
                    if (typeof v === 'boolean') return !v;
                    if (typeof v === 'object') return Object.values(v).every(cat => Object.values(cat).every(subV => !subV));
                    return true;
                })}>
                    <MessageSquareQuote className="mr-2 h-4 w-4" />
                    Gerar Prompt e Usar
                </Button>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
