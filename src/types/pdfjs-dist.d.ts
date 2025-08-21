declare module 'pdfjs-dist' {
  export const version: string;
  export const GlobalWorkerOptions: any;
  export function getDocument(src: string | Uint8Array | { url: string }): any;
}

declare module 'pdfjs-dist/web/pdf_viewer' {
  export class TextLayerBuilder {
    constructor(options: {
      textLayerDiv: HTMLDivElement;
      pageIndex: number;
      viewport: any;
      eventBus?: any;
      enhanceTextSelection?: boolean;
    });
    setTextContentSource(source: any): void;
    render(): void;
    textLayerDiv: HTMLDivElement;
  }
}
