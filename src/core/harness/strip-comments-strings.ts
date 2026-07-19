/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Shared source-stripper for the harness heuristic scanners.
 *
 * PORQUÊ: os scanners de harness (type-coverage, error-handling) casam padrões
 * via regex sobre o texto do arquivo. Sem remover comentários e strings, um
 * padrão que aparece SÓ num comentário (`// catch (e) {}`) ou numa string
 * (`"throw new Error(x)"`) vira violação-fantasma — infla a contagem, baixa o
 * score e não tem fix de produção possível (node_4401a2818b83).
 *
 * Este módulo é a fonte única do stripper (DRY): antes vivia privado em
 * type-coverage-scanner.ts; agora ambos os scanners o consomem. Preserva
 * offsets/linhas (troca conteúdo por espaços, mantém `\n`) para que o
 * line-number reporting dos consumidores continue exato.
 */

/**
 * Blanks out `//` line comments, block comments, and string/template literal
 * contents (replacing with spaces, preserving line numbers/offsets so
 * downstream line-number reporting stays accurate) — a naive char-by-char
 * scanner good enough for these heuristics, not a full TS tokenizer.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      while (i < n && source[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (two === '/*') {
      out += '  '
      i += 2
      while (i < n && source.slice(i, i + 2) !== '*/') {
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
      continue
    }
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      out += ' '
      i++
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < n) {
          out += '  '
          i += 2
          continue
        }
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += ' '
        i++
      }
      continue
    }
    out += ch
    i++
  }
  return out
}
