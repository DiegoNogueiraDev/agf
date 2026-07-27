/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * Filtros declarativos (on-demand): qualquer comando ganha cobertura via uma
 * REGRA em JSON — sem escrever código. Uma regra `{ name, detect, keep?, drop? }`
 * compila num {@link CompressFilter} e entra no registry. É a resposta a "todos os
 * comandos": em vez de hardcodar uma lista infinita, o usuário/projeto adiciona
 * só os que importam (descobertos pelo discover loop). Carregado de
 * `AGF_COMPRESS_FILTERS=<arquivo.json>` uma única vez.
 */
import { existsSync, readFileSync } from 'node:fs'
import { safeCompileRegexes } from '../utils/safe-regexp.js'
import { registerFilter, clearCustomFilters, type CompressFilter } from './registry.js'
import { ensureFilterOverridesLoaded, _resetFilterOverrides } from './filter-overrides.js'
import { loadBuiltinTomlFilters, _resetBuiltinFilters } from './builtin-filters.js'
import { applyTomlPipeline, type TomlPipelineStage } from './toml-pipeline.js'
import { auditCandidate, createApprovedSet } from './tokenizer-feedback-audit.js'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'tool-compress/custom-filters.ts' })

// node_wire_16a06f4fe66d — tokenizer-feedback-audit wire. Custom filters are
// user-authored (loaded from AGF_COMPRESS_FILTERS/.agf/filters.toml) and
// unlike built-ins are never vetted — a badly-written rule can silently
// inflate output instead of shrinking it. Warn once per filter name so a
// misbehaving custom filter surfaces without repeat-logging every call.
const warnedInflating = createApprovedSet()

/** Wrap a compiled custom filter so real invocations are audited for token inflation. */
export function withTokenAudit(filter: CompressFilter): CompressFilter {
  return {
    ...filter,
    apply: (text: string): string => {
      const after = filter.apply(text)
      if (!warnedInflating.has(filter.name)) {
        const result = auditCandidate({ id: filter.name, before: text, after }, warnedInflating)
        if (!result.accepted) {
          warnedInflating.add(filter.name)
          log.warn('custom-filter-inflates-tokens', {
            filterName: filter.name,
            tokensBefore: result.tokensBefore,
            tokensAfter: result.tokensAfter,
          })
        }
      }
      return after
    },
  }
}

export interface CustomFilterRule {
  /** Nome do filtro (aparece no log/discover). */
  name: string
  /** Prioridade (menor = antes). Default 55 — entre build-output e estruturais. */
  priority?: number
  /** Regexes; QUALQUER um casando na janela inicial → este filtro é escolhido. */
  detect: string[]
  /** Linhas que casam SEMPRE sobrevivem (vencem `drop`). Ex.: erro/falha/sumário. */
  keep?: string[]
  /** Linhas que casam são descartadas (colapsadas numa contagem). Ex.: ruído OK. */
  drop?: string[]
  /** 8-stage TOML pipeline (advanced, replaces keep/drop for complex filters). */
  pipeline?: TomlPipelineStage
}

function compileRegexes(patterns: string[] | undefined): RegExp[] {
  return safeCompileRegexes(patterns)
}

/** Compila uma regra declarativa num filtro do registry. Lança se a regra é inválida. */
export function compileCustomFilter(rule: CustomFilterRule): CompressFilter {
  if (!rule.name || typeof rule.name !== 'string') throw new McpGraphError('custom filter: name obrigatório')
  if (!Array.isArray(rule.detect) || rule.detect.length === 0)
    throw new McpGraphError(`custom filter ${rule.name}: detect[] obrigatório`)
  const detectRes = compileRegexes(rule.detect)

  const apply = (text: string): string => {
    // Use 8-stage pipeline if defined (advanced mode)
    if (rule.pipeline) {
      return applyTomlPipeline(text, rule.pipeline)
    }

    // Legacy keep/drop mode
    const keepRes = compileRegexes(rule.keep)
    const dropRes = compileRegexes(rule.drop)
    const out: string[] = []
    let dropped = 0
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      if (keepRes.some((r) => r.test(line))) {
        out.push(line)
        continue
      }
      if (dropRes.some((r) => r.test(line))) {
        dropped++
        continue
      }
      out.push(line)
    }
    if (dropped > 0) out.push(`… +${dropped} linhas colapsadas (${rule.name})`)
    const res = out.join('\n')
    return res.length > 0 && res.length < text.length ? res : text
  }
  ;(apply as unknown as { filterName: string }).filterName = rule.name

  return {
    name: rule.name,
    priority: typeof rule.priority === 'number' ? rule.priority : 55,
    detect: (ctx) => detectRes.some((r) => r.test(ctx.head)),
    apply,
  }
}

/** Lê regras de um JSON (array de {@link CustomFilterRule}) e registra cada uma. */
export function loadCustomFiltersFromFile(filePath: string): number {
  if (!existsSync(filePath)) return 0
  let rules: unknown
  try {
    rules = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    log.warn('custom-filter:bad-json', { filePath, error: err instanceof Error ? err.message : String(err) })
    return 0
  }
  if (!Array.isArray(rules)) return 0
  let n = 0
  for (const raw of rules) {
    try {
      registerFilter(withTokenAudit(compileCustomFilter(raw as CustomFilterRule)))
      n++
    } catch (err) {
      log.warn('custom-filter:skip', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (n > 0) log.info('custom-filter:loaded', { filePath, count: n })
  return n
}

let loaded = false

/**
 * Carrega os filtros custom de `AGF_COMPRESS_FILTERS` (arquivo JSON) uma única vez.
 * Idempotente — chamada no ponto de entrada da compressão. Sem env → no-op.
 */
export function ensureCustomFiltersLoaded(env: Record<string, string | undefined> = process.env): void {
  if (loaded) return
  loaded = true

  // Load built-in TOML filters (compiled at build time)
  loadBuiltinTomlFilters()

  const filePath = env.AGF_COMPRESS_FILTERS
  if (filePath) loadCustomFiltersFromFile(filePath)
  // Also load project-local TOML overrides (.agf/filters.toml)
  ensureFilterOverridesLoaded(process.cwd())
}

/** Reseta o estado de carga (apenas testes). */
export function _resetCustomFiltersLoaded(): void {
  loaded = false
  clearCustomFilters()
  _resetFilterOverrides()
  _resetBuiltinFilters()
}
