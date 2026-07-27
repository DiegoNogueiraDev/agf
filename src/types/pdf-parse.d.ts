/** Type stub for pdf-parse v2+ (class-based API). */
declare module 'pdf-parse' {
  export interface PageTextResult {
    num: number
    text: string
  }

  export class TextResult {
    pages: Array<PageTextResult>
    text: string
    total: number
    getPageText(num: number): string
  }

  export class PDFParse {
    constructor(options: { data: Uint8Array | Buffer })
    getText(): Promise<TextResult>
    destroy(): Promise<void>
  }
}
