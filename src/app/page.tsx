'use client';

import Script from 'next/script';

// Define o tipo para o elemento customizado do widget para que o TypeScript não reclame.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gen-search-widget': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'config-id': string;
          'trigger-id': string;
        },
        HTMLElement
      >;
    }
  }
}

export default function SearchPage() {
  return (
    <>
      {/* Carrega o script do widget do Google Cloud */}
      <Script
        src="https://cloud.google.com/ai/gen-app-builder/client?hl=pt_BR"
        strategy="afterInteractive"
      />
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-2xl font-bold">Pesquisa Inteligente</h1>
          <p className="mt-2 text-muted-foreground">
            Clique no campo abaixo para abrir a interface de busca.
          </p>

          <div className="mt-6">
            {/* O input que aciona o widget. O ID aqui deve corresponder ao trigger-id do widget. */}
            <input
              id="searchWidgetTrigger"
              placeholder="Pesquise aqui"
              className="flex h-12 w-full rounded-md border border-input bg-background px-4 py-2 text-lg ring-offset-background placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          {/* O elemento do widget em si. Ele é invisível por padrão e é ativado pelo trigger. */}
          <gen-search-widget
            config-id="05715c26-4df8-4676-84b9-475cec8e1191"
            trigger-id="searchWidgetTrigger"
          ></gen-search-widget>
        </div>
      </div>
    </>
  );
}
