/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /zoom-out — REVIEW helper: step up one abstraction layer, map callers + deps.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed, fmtNode } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'
import { globSync } from 'glob'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const _log = createLogger({ layer: 'core', source: 'zoom-out.ts' })

export class ZoomOutHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, dir, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /zoom-out ═']
    const target = args.trim()

    if (!target) {
      lines.push('Uso: /zoom-out <arquivo.ts | diretório>')
      lines.push('Sobe um nível de abstração para mapear contexto do módulo.')
      return lines.join('\n')
    }
    lines.push(`Análise: ${target}`)

    // Step 1: Resolve target
    onProgress({ step: 1, total: 5, label: 'Resolvendo alvo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const fullPath = path.resolve(dir, target)
    const isDir = existsSync(fullPath) && statSync(fullPath).isDirectory()
    const files = isDir
      ? globSync(`${target}/**/*.ts`, { cwd: dir, ignore: ['**/*.test.ts', '**/node_modules/**', '**/__tests__/**'] })
      : existsSync(fullPath)
        ? [target]
        : []

    if (files.length === 0) {
      lines.push(`Arquivo/diretório não encontrado: ${target}`)
      return lines.join('\n')
    }
    lines.push(`Módulos: ${files.length}`)

    // Step 2: Extract module purpose
    onProgress({ step: 2, total: 5, label: 'Extraindo propósito...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    for (const file of files.slice(0, 5)) {
      const absPath = path.join(dir, file)
      try {
        const content = readFileSync(absPath, 'utf-8')
        const firstComment = content.match(/\/\*[\s\S]*?\*\/|(?:\/\/[^\n]*\n)+/)?.[0] ?? ''
        const cleanComment = firstComment.replace(/\/\*+|\*+\/|\/\/|\* /g, '').trim()
        const excerpt = cleanComment.slice(0, 100) || '(sem descrição)'
        const linesCount = content.split('\n').length
        lines.push(`  ${file} — ${linesCount}L: ${excerpt}`)
      } catch {
        lines.push(`  ${file} — (não foi possível ler)`)
      }
    }
    if (files.length > 5) {
      lines.push(`  … +${files.length - 5} arquivos`)
    }

    // Step 3: Find callers (who imports this module)
    onProgress({ step: 3, total: 5, label: 'Mapeando callers...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const allSrcFiles = globSync('src/**/*.ts', {
      cwd: dir,
      ignore: ['**/*.test.ts', '**/*.bench.ts', '**/node_modules/**', '**/__tests__/**'],
    })

    const _moduleName = target
      .replace(/\.ts$/, '')
      .replace(/^src\//, '')
      .replace(/\/index$/, '')
    const callers: Map<string, number> = new Map()

    for (const srcFile of allSrcFiles) {
      if (files.includes(srcFile)) continue
      try {
        const content = readFileSync(path.join(dir, srcFile), 'utf-8')
        for (const file of files) {
          const importName = file.replace(/\.ts$/, '').replace(/^src\//, '')
          const regex = new RegExp(
            `from\\s+["'](\\.\\.?/[^'"]*${importName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^'"]*|${importName.replace(/\//g, '\\/')})["']`,
            'g',
          )
          const matches = content.match(regex)
          if (matches) {
            callers.set(srcFile, (callers.get(srcFile) ?? 0) + matches.length)
          }
        }
      } catch {
        // skip unreadable
      }
    }
    const callerList = [...callers.entries()].sort((a, b) => b[1] - a[1])
    lines.push(`Callers: ${callerList.length} arquivos`)
    if (callerList.length > 0) {
      for (const [cFile, ct] of callerList.slice(0, 10)) {
        lines.push(`  ↑ ${cFile} (${ct} ref(s))`)
      }
      if (callerList.length > 10) {
        lines.push(`  … +${callerList.length - 10} callers`)
      }
    }

    // Step 4: Map direct dependencies
    onProgress({ step: 4, total: 5, label: 'Mapeando dependências...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const imports: Set<string> = new Set()
    for (const file of files) {
      try {
        const content = readFileSync(path.join(dir, file), 'utf-8')
        const importLines = content.match(/^import\s+.*from\s+['"]([^'"]+)['"]/gm) ?? []
        for (const line of importLines) {
          const match = line.match(/from\s+['"]([^'"]+)['"]/)
          if (match && !match[1].startsWith('.') && !match[1].startsWith('node:')) {
            imports.add(match[1])
          }
        }
      } catch {
        // skip
      }
    }
    lines.push(`Dependências diretas: ${imports.size} pacotes/módulos`)
    const importList = [...imports].sort()
    for (const imp of importList.slice(0, 8)) {
      lines.push(`  ↓ ${imp}`)
    }

    // Step 5: Graph context — find owning epic/requirement
    onProgress({ step: 5, total: 5, label: 'Contexto do grafo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const doc = store.toGraphDocument()
    const relatedNodes = doc.nodes.filter((n) => {
      if (!n.sourceRef) return false
      for (const file of files) {
        if (n.sourceRef.file === file) return true
      }
      return false
    })
    if (relatedNodes.length > 0) {
      lines.push(`Nós no grafo: ${relatedNodes.length}`)
      for (const rn of relatedNodes.slice(0, 5)) {
        const parent = rn.parentId ? doc.nodes.find((n) => n.id === rn.parentId) : null
        lines.push(`  ${fmtNode(rn)}${parent ? ` (parent: ${parent.title})` : ''}`)
      }
    } else {
      lines.push('Nenhum nó no grafo referencia estes arquivos.')
    }

    lines.push('')
    lines.push('Dica: este é um mapa, não comentário. Use para orientação antes de refatorar.')
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
