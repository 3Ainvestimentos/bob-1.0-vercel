
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { BobIcon } from '../icons/BobIcon';
import { cn } from '@/lib/utils';

const tourSteps = [
    {
        title: "Bem-vindo ao Bob!",
        content: "Sou seu novo assistente de IA. Deixe-me mostrar rapidamente como posso te ajudar a otimizar seu trabalho.",
        elementSelector: null,
    },
    {
        elementSelector: '#new-buttons-container',
        title: "Inicie ou Organize suas Conversas",
        content: "Use estes botões para começar uma nova conversa ou para agrupar seus chats em projetos, mantendo tudo organizado.",
        position: 'right',
    },
    {
        elementSelector: '#chat-input-form',
        title: "Faça sua Pergunta Aqui",
        content: "Você pode digitar suas perguntas, anexar arquivos para análise clicando no clipe (📎) ou gravar um áudio clicando no microfone (🎤).",
        position: 'top',
    },
    {
        elementSelector: '#search-source-selector',
        title: "Escolha sua Fonte de Busca",
        content: "Alterne entre a nossa base de conhecimento interna para respostas seguras ou a web para informações atualizadas.",
        position: 'top-end',
    },
    {
        elementSelector: '#suggestion-cards',
        title: "Sugestões Rápidas",
        content: "Não sabe por onde começar? Clique em um destes cards para fazer uma pergunta pré-programada e ver o Bob em ação.",
        position: 'bottom',
    },
    {
        title: "Pronto para Começar!",
        content: "É isso! Agora você está pronto para explorar todo o potencial do Bob. Se tiver dúvidas, clique em 'Guias e FAQ' no menu.",
        elementSelector: null, 
    },
];

interface OnboardingTourProps {
    onFinish: () => void;
}

export const OnboardingTour = ({ onFinish }: OnboardingTourProps) => {
    const [stepIndex, setStepIndex] = useState(0);
    const [elementRect, setElementRect] = useState<DOMRect | null>(null);

    const currentStep = tourSteps[stepIndex];

    useEffect(() => {
        let animationFrameId: number;

        const updateElement = () => {
            if (currentStep.elementSelector) {
                const element = document.querySelector(currentStep.elementSelector) as HTMLElement;
                if (element) {
                    setElementRect(element.getBoundingClientRect());
                    element.style.setProperty('z-index', '1001', 'important');
                    element.style.setProperty('position', 'relative', 'important');
                } else {
                    setElementRect(null);
                }
            } else {
                setElementRect(null);
            }
        };

        animationFrameId = requestAnimationFrame(updateElement);

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (currentStep.elementSelector) {
                const element = document.querySelector(currentStep.elementSelector) as HTMLElement;
                if (element) {
                    element.style.removeProperty('z-index');
                    element.style.removeProperty('position');
                }
            }
        };
    }, [stepIndex, currentStep.elementSelector]);


    const handleNext = () => {
        if (stepIndex < tourSteps.length - 1) {
            setStepIndex(stepIndex + 1);
        } else {
            onFinish();
        }
    };

    const handlePrev = () => {
        if (stepIndex > 0) {
            setStepIndex(stepIndex - 1);
        }
    };

    const highlightStyle = useMemo(() => {
        const padding = 10;
        const rect = elementRect || { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 };
        
        const style: React.CSSProperties = {
            width: `${rect.width + padding * 2}px`,
            height: `${rect.height + padding * 2}px`,
            top: `${rect.top - padding}px`,
            left: `${rect.left - padding}px`,
            boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.6)`,
            borderRadius: '0.75rem',
            transition: 'top 0.3s ease-in-out, left 0.3s ease-in-out, width 0.3s ease-in-out, height 0.3s ease-in-out',
        };

        if (!elementRect) {
            style.opacity = 0;
            style.pointerEvents = 'none';
        }
        
        return style;

    }, [elementRect]);
    
    const popoverPositionStyle = useMemo(() => {
        if (!elementRect) {
            return {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
            };
        }
        
        const padding = 20;
        const popoverWidth = 320; 

        let finalPosition: React.CSSProperties = {};

        switch (currentStep.position) {
            case 'right':
                const isSecondStep = stepIndex === 1;
                const topPosition = isSecondStep ? elementRect.bottom : elementRect.top;
                const transformY = isSecondStep ? 'translateY(-100%)' : 'translateY(0)';
                
                if (elementRect.right + popoverWidth + padding > window.innerWidth) {
                    finalPosition = { top: topPosition, left: elementRect.left - padding, transform: `translateX(-100%) ${transformY}` };
                } else {
                    finalPosition = { top: topPosition, left: elementRect.right + padding, transform: transformY };
                }
                break;
            case 'left':
                finalPosition = { top: elementRect.top, left: elementRect.left - padding, transform: 'translateX(-100%)' };
                break;
            case 'bottom':
                finalPosition = { top: elementRect.bottom + padding, left: elementRect.left };
                break;
            case 'top-end':
                finalPosition = { top: elementRect.top - padding, left: elementRect.right, transform: 'translate(-100%, -100%)' };
                break;
            case 'top':
            default:
                finalPosition = { top: elementRect.top - padding, left: elementRect.left, transform: 'translateY(-100%)' };
                break;
        }
        return finalPosition;
    }, [elementRect, currentStep.position, stepIndex]);


    return (
        <div className="fixed inset-0 z-[1000]">
            <div className="fixed inset-0 bg-black/60" />
            <div
                className="absolute pointer-events-none"
                style={highlightStyle}
            />

            <div
                className={cn("absolute z-[1002] w-80 max-w-sm bg-card text-card-foreground shadow-2xl transition-all duration-300 ease-in-out overflow-hidden rounded-lg",
                )}
                style={popoverPositionStyle}
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                         <BobIcon className="h-10 w-10 shrink-0" />
                        <h3 className="text-lg font-bold">{currentStep.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{currentStep.content}</p>
                </div>
                <div className="flex items-center justify-between px-6 py-4 bg-muted/50">
                    <Button variant="ghost" size="sm" onClick={onFinish}>Pular</Button>
                    <div className="flex items-center gap-2">
                        {stepIndex > 0 && (
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <Button 
                            onClick={handleNext} 
                            className="h-8 hover:opacity-90"
                            style={{ backgroundColor: 'hsl(var(--chart-2))', color: 'black' }}
                        >
                            {stepIndex === tourSteps.length - 1 ? 'Finalizar' : 'Próximo'}
                            {stepIndex < tourSteps.length - 1 && <ChevronRight className="ml-1 h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
