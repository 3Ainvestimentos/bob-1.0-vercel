'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Bot } from "lucide-react";

export default function ChatApiPage() {
    return (
        <div className="flex h-full w-full flex-col p-4 md:p-6">
            <Card className="flex-1">
                <CardHeader>
                    <div className="flex items-start gap-4">
                        <Bot className="h-8 w-8 flex-shrink-0 text-primary" />
                        <div className="flex-1">
                            <CardTitle className="text-xl">Assistente via API</CardTitle>
                            <CardDescription>
                                Este é o local para a futura implementação do chat via API.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">O conteúdo do chat via API será exibido aqui.</p>
                </CardContent>
            </Card>
        </div>
    );
}
