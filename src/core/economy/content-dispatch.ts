/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type ContentType = 'code' | 'json' | 'log' | 'text'

const RE_CODE_LINE =
  /^(import |export |function |const |let |var |interface |type |class |enum |@|#!|diff --git|@@ |[\w]+\s*[:=]\s*function|async\s+function)/
const RE_LOG_TIMESTAMP =
  /^(\[\d{4}[-/]\d{2}[-/]\d{2}|^\d{4}[-/]\d{2}[-/]\d{2}|^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/
const RE_LOG_LEVEL = /\b(INFO|WARN(?:ING)?|ERROR|DEBUG|TRACE|FATAL)\b(\s*[:)]|$)/im
const RE_SHELL = /^(git |npm |yarn |pnpm |npx |cargo |pip |docker |kubectl |ls |cd |cat |echo |mkdir |rm )/

/** Classify a text fragment as JSON, shell output, log output, or plain text for routing to the right compressor. */
export function detectContentType(text: string): ContentType {
  const trimmed = text.trim()
  if (!trimmed) return 'text'

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // skip invalid JSON
    }
  }

  if (RE_LOG_TIMESTAMP.test(trimmed) && RE_LOG_LEVEL.test(trimmed)) return 'log'

  const lines = trimmed.split('\n')
  const firstLine = lines[0].trim()
  if (RE_CODE_LINE.test(firstLine)) return 'code'

  if (RE_SHELL.test(firstLine)) return 'code'

  // When the first line is a comment, scan past it to detect code underneath.
  // Tool outputs commonly begin with `// header\nimport ...` — without this, the
  // block is misclassified as 'text' and routed through caveman instead of AST.
  if (firstLine.startsWith('//') || firstLine.startsWith('/*') || firstLine.startsWith('*')) {
    for (let i = 1; i < Math.min(lines.length, 8); i++) {
      const t = lines[i].trim()
      if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue
      if (RE_CODE_LINE.test(t)) return 'code'
      break
    }
  }

  if (firstLine.includes('://') || firstLine.startsWith('#')) return 'text'

  return 'text'
}
