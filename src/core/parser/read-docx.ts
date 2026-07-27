/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * DOCX Parser — extracts text content from .doc and .docx files using mammoth.
 *
 * Dependency: mammoth (~200KB, pure JS, zero native deps).
 * Uses dynamic import to avoid startup cost.
 */

import { readFile } from 'node:fs/promises'
import { createLogger } from '../utils/logger.js'
import { FileNotFoundError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'read-docx.ts' })

const DOCX_EXTENSIONS = new Set(['.doc', '.docx'])

/**
 * Check if a file extension is a supported Word document format.
 */
export function isDocxSupported(ext: string): boolean {
  return DOCX_EXTENSIONS.has(ext.toLowerCase())
}

/**
 * Extract text content from a .docx file using mammoth.
 * For .doc (legacy binary format), mammoth will attempt extraction
 * but may have limited formatting support.
 */
export async function readDocxContent(filePath: string): Promise<string> {
  let buffer: Buffer
  try {
    buffer = await readFile(filePath)
  } catch {
    throw new FileNotFoundError(filePath)
  }

  if (buffer.length === 0) {
    throw new FileNotFoundError(`File is empty: ${filePath}`)
  }

  log.info('Parsing DOCX file', { filePath, sizeBytes: buffer.length })

  // Dynamic import — mammoth is heavy, lazy-load
  const mammoth = await import('mammoth')

  const resultValue = await mammoth.convertToHtml({ buffer })

  // Convert HTML output to plain text with markdown-like headings
  const text = htmlToText(resultValue.value)

  if (resultValue.messages.length > 0) {
    log.debug('DOCX parse messages', {
      filePath,
      messages: resultValue.messages.map((m: { type: string; message: string }) => m.message).join('; '),
    })
  }

  log.info('DOCX parsed', { filePath, textLength: text.length })

  return text
}

/**
 * Simple HTML-to-text conversion for mammoth output.
 * Mammoth produces clean HTML — we just need headings, lists, paragraphs.
 */
function htmlToText(html: string): string {
  let text = html

  // Convert headings to markdown
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
  text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n')

  // Convert list items
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')

  // Convert paragraphs to newlines
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')

  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}
