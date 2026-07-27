/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-pdf.ts' })

interface PdfReadResult {
  text: string
  pages: number
}

/**
 * Extract text content from a PDF buffer using pdf-parse v2 (PDFParse class).
 */
export async function readPdfBuffer(buffer: Buffer): Promise<PdfReadResult> {
  // Dynamic import — pdf-parse v2 is class-based, lazy-load to avoid startup cost.
  // Types resolved via src/types/pdf-parse.d.ts (always-on stub, robust to
  // CI environments that may prune node_modules between jobs).
  const { PDFParse } = await import('pdf-parse')

  log.info('Parsing PDF buffer', { sizeBytes: buffer.length })

  const PDF_TIMEOUT_MS = 30_000
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const resultValue = await Promise.race([
    parser.getText(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`PDF parsing timed out after ${PDF_TIMEOUT_MS / 1000}s`)), PDF_TIMEOUT_MS),
    ),
  ])

  log.info('PDF parsed', { pages: resultValue.total, textLength: resultValue.text.length })

  return {
    text: resultValue.text,
    pages: resultValue.total,
  }
}
