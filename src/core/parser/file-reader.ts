/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { readPdfBuffer } from './read-pdf.js'
import { readHtmlContent } from './read-html.js'
import { readDocxContent } from './read-docx.js'
import { extractPrdText } from '../importer/prd-format-parser.js'
import { createLogger } from '../utils/logger.js'
import { ValidationError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'file-reader.ts' })

/** Maximum file size in bytes (50 MB) */
const MAX_FILE_SIZE = 50 * 1024 * 1024

const SUPPORTED_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.pdf',
  '.html',
  '.htm',
  '.doc',
  '.docx',
  '.yaml',
  '.yml',
  '.json',
  '.wsdl',
  '.sif',
  '.xlsx',
])

export interface FileReadResult {
  text: string
  originalName: string
  format: string
  sizeBytes: number
}

/**
 * Read a file and extract its text content based on extension.
 * Supports: .md, .txt, .pdf, .html, .htm
 */
export async function readFileContent(filePath: string, originalName?: string): Promise<FileReadResult> {
  const name = originalName ?? path.basename(filePath)
  const ext = path.extname(name).toLowerCase()

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new ValidationError(`Unsupported file format: "${ext}". Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`, [
      `unsupported extension: ${ext}`,
    ])
  }

  // Check file size before reading into memory
  const fileStat = await stat(filePath)
  if (fileStat.size > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File too large: ${(fileStat.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
      [`file size ${fileStat.size} exceeds limit ${MAX_FILE_SIZE}`],
    )
  }

  log.info('Reading file', { name, ext, sizeBytes: fileStat.size })

  const buffer = await readFile(filePath)
  const sizeBytes = buffer.length
  let text: string

  switch (ext) {
    case '.pdf': {
      const resultValue = await readPdfBuffer(buffer)
      text = resultValue.text
      break
    }
    case '.html':
    case '.htm': {
      const html = buffer.toString('utf-8')
      text = await readHtmlContent(html)
      break
    }
    case '.doc':
    case '.docx': {
      text = await readDocxContent(filePath)
      break
    }
    case '.xlsx': {
      text = await extractPrdText('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer)
      break
    }
    case '.yaml':
    case '.yml':
    case '.json':
    case '.wsdl':
    case '.sif':
    case '.md':
    case '.txt':
    default: {
      text = buffer.toString('utf-8')
      break
    }
  }

  log.info('File read complete', { name, format: ext, textLength: text.length })

  return {
    text,
    originalName: name,
    format: ext,
    sizeBytes,
  }
}

/** Check whether a filename has a supported import extension (.md, .txt, .html, .pdf, .docx, etc.). */
export function isSupportedFormat(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return SUPPORTED_EXTENSIONS.has(ext)
}
