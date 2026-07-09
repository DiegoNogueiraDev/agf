/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Coletor de arquivos de código sob `<dir>/src` para os scanners de qualidade.
 * Recursivo; pula dirs de build/deps; ignora `.d.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SourceFile } from './logging-coverage-scanner.js'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'tools'])

/** Lê os arquivos .ts/.tsx de `<dir>/src`. Diretório ausente → lista vazia. */
export function collectSrcFiles(dir: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (d: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(d, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full)
      else if (/\.[tj]sx?$/.test(name) && !name.endsWith('.d.ts')) {
        try {
          out.push({ path: full, content: readFileSync(full, 'utf8') })
        } catch {
          /* ilegível — ignora */
        }
      }
    }
  }
  walk(join(dir, 'src'))
  return out
}
