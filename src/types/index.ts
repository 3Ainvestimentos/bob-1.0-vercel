// Adding type definition for Vertex AI Search Widget custom element.
declare namespace JSX {
  interface IntrinsicElements {
    'gen-search-widget': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        configId: string;
        triggerId: string;
      },
      HTMLElement
    >;
  }
}
