/*!
 * prd-format-parser — MIME detection and text extraction for multi-format PRD files.
 *
 * WHY: import-prd currently only handles .md via readFileSync utf8. Supporting
 * .docx/.pdf/.xlsx requires format detection + format-specific extraction.
 * This module adds the detection layer (pure, no I/O) and a text-extraction
 * gateway that handles text formats directly and delegates binary formats to
 * optional parsers (installable separately to avoid bloating the core bundle).
 *
 * Binary format parsers (pdf, docx, xlsx) are dynamically imported on demand —
 * if the dep is not installed, extractPrdText throws UnsupportedFormatError
 * with a clear install hint.
 *
 * Extends: src/core/importer/prd-to-graph.ts (the caller reads the text this
 * module produces and passes it to extractEntities).
 */

import { extname } from 'node:path'

export type PrdMimeType =
  | 'text/markdown'
  | 'text/plain'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const EXT_MIME_MAP: Record<string, PrdMimeType> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/**
 * Detect the MIME type of a PRD file by its extension.
 * Returns null for unknown/unsupported extensions.
 */
export function detectPrdMime(filename: string): PrdMimeType | null {
  const ext = extname(filename).toLowerCase()
  return EXT_MIME_MAP[ext] ?? null
}

/** Thrown when extractPrdText encounters a format with no installed parser. */
export class UnsupportedFormatError extends Error {
  constructor(
    public readonly mime: string,
    hint?: string,
  ) {
    super(`Unsupported PRD format: ${mime}.${hint ? ' ' + hint : ''}`)
    this.name = 'UnsupportedFormatError'
  }
}

/**
 * Extract plain text from a PRD file buffer given its MIME type.
 *
 * - text/markdown and text/plain: decoded directly (UTF-8).
 * - application/pdf: requires `pdf-parse` (npm install pdf-parse).
 * - docx: requires `mammoth` (npm install mammoth).
 * - xlsx: requires `xlsx` (npm install xlsx).
 *
 * Throws UnsupportedFormatError with an install hint when the optional dep
 * is missing, so callers can surface a clear error message.
 */
export async function extractPrdText(mime: PrdMimeType, buffer: Buffer): Promise<string> {
  if (mime === 'text/markdown' || mime === 'text/plain') {
    return buffer.toString('utf8')
  }

  if (mime === 'application/pdf') {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      try {
        const result = await parser.getText()
        return result.text
      } finally {
        await parser.destroy()
      }
    } catch {
      throw new UnsupportedFormatError(mime, 'Install with: npm install pdf-parse')
    }
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return result.value
    } catch {
      throw new UnsupportedFormatError(mime, 'Install with: npm install mammoth')
    }
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    try {
      // xlsx is an optional dep not installed in core; load via Function to bypass tsc module resolution

      const XLSX = (await new Function('m', 'return import(m)')('xlsx')) as Record<string, unknown> & {
        read: (b: Buffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> }
        utils: { sheet_to_csv: (ws: unknown) => string }
      }
      const wb = XLSX.read(buffer, { type: 'buffer' })
      return wb.SheetNames.map((name) => XLSX.utils.sheet_to_csv(wb.Sheets[name])).join('\n')
    } catch {
      throw new UnsupportedFormatError(mime, 'Install with: npm install xlsx')
    }
  }

  throw new UnsupportedFormatError(mime)
}
