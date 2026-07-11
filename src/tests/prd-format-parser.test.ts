/*!
 * TDD: import-prd multi-format parser — pdf/docx/xlsx via mime detection (node_4ec8874a3000).
 *
 * AC1: Given a .docx PRD, When import-prd runs, Then imports correctly (text extracted).
 * AC2: Given unsupported format, When runs, Then errors with clear message (no corruption).
 */

import { describe, it, expect } from 'vitest'
import { detectPrdMime, type PrdMimeType } from '../core/importer/prd-format-parser.js'

describe('AC1: MIME detection identifies supported formats', () => {
  it('detects .md as markdown', () => {
    expect(detectPrdMime('PRD.md')).toBe('text/markdown')
  })

  it('detects .txt as plain text', () => {
    expect(detectPrdMime('prd.txt')).toBe('text/plain')
  })

  it('detects .docx as word document', () => {
    expect(detectPrdMime('requirements.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('detects .pdf as pdf', () => {
    expect(detectPrdMime('spec.pdf')).toBe('application/pdf')
  })

  it('detects .xlsx as spreadsheet', () => {
    expect(detectPrdMime('tasks.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })
})

describe('AC2: unsupported formats error clearly', () => {
  it('returns null for unknown extension', () => {
    expect(detectPrdMime('binary.exe')).toBeNull()
  })

  it('returns null for no extension', () => {
    expect(detectPrdMime('PRD')).toBeNull()
  })
})

describe('extractPrdText handles text formats directly', () => {
  it('extractPrdText returns content for markdown', async () => {
    const { extractPrdText } = await import('../core/importer/prd-format-parser.js')
    const content = '# My PRD\n\nThis is the spec.'
    const result = await extractPrdText('text/markdown', Buffer.from(content, 'utf8'))
    expect(result).toBe(content)
  })

  it('extractPrdText returns content for plain text', async () => {
    const { extractPrdText } = await import('../core/importer/prd-format-parser.js')
    const content = 'Plain text PRD content'
    const result = await extractPrdText('text/plain', Buffer.from(content, 'utf8'))
    expect(result).toBe(content)
  })

  it('extractPrdText throws UnsupportedFormatError for a malformed/invalid pdf buffer', async () => {
    const { extractPrdText, UnsupportedFormatError } = await import('../core/importer/prd-format-parser.js')
    await expect(extractPrdText('application/pdf', Buffer.from('fake pdf'))).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    )
  })

  it('extractPrdText extracts real text from a valid PDF (pdf-parse v2 class API)', async () => {
    const { extractPrdText } = await import('../core/importer/prd-format-parser.js')
    // Minimal single-page PDF with a Helvetica "Hello" text run — proves the
    // real extraction path (PDFParse().getText()), not just the error path.
    const minimalPdf = Buffer.from(
      '%PDF-1.1\n' +
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 200 200]/Contents 5 0 R>>endobj\n' +
        '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
        '5 0 obj<</Length 44>>stream\nBT /F1 24 Tf 10 100 Td (Hello) Tj ET\nendstream\nendobj\n' +
        'xref\n0 6\n0000000000 65535 f \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF',
    )
    const result = await extractPrdText('application/pdf', minimalPdf)
    expect(result).toContain('Hello')
  })
})
