/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import { listFilters, detectFilter } from '../../core/tool-compress/registry.js'
import { ensureCustomFiltersLoaded } from '../../core/tool-compress/custom-filters.js'
import { loadDiscover, scanLedgerForMissedFilters } from '../../core/tool-compress/discover.js'
import { compressToolOutput } from '../../core/tool-compress/index.js'
import { compressOutput } from '../../core/exec/run-compress.js'
import { openStoreOrFail, openStoreIfExists } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { recordCompressRunSavings } from '../../core/economy/compress-run-ledger.js'
import { applyTaskAwareToPayload } from '../../core/economy/task-aware-prune.js'
import { buildSignalFromNode, extractTaskSignal, type TaskSignal } from '../../core/context/task-signal.js'
import { compressTrajectory, type Turn } from '../../core/tool-compress/trajectory-compressor.js'

/** Shape of a buildCompressRunPayload result — used by tests. */
export interface CompressRunPayload {
  compressed: string
  tokens: { before: number; after: number; saved: number; ratio: number }
  filter: string | null
  lossless: boolean
  ccrHash?: string
}

/**
 * Pure helper: apply compression pipeline to raw text.
 * Used by both the --stdin path and tests.
 */
export function buildCompressRunPayload(raw: string, opts?: { noCompress?: boolean }): CompressRunPayload {
  if (opts?.noCompress) {
    const t = raw.length / 4 // rough token estimate
    return {
      compressed: raw,
      tokens: { before: t, after: t, saved: 0, ratio: 1 },
      filter: null,
      lossless: true,
    }
  }
  const r = compressOutput(raw, null)
  return {
    compressed: r.compressed,
    tokens: { before: r.tokensBefore, after: r.tokensAfter, saved: r.saved, ratio: r.ratio },
    filter: r.filter,
    lossless: r.lossless,
    ccrHash: r.ccrHash,
  }
}

/** Builds the `agf compress` CLI command (Commander definition). */
export function compressCommand(): Command {
  const cmd = new Command('compress').description('Compressor de saída de ferramenta: filtros, discover, teste')

  cmd
    .command('filters', { isDefault: true })
    .description('Lista os filtros ativos (built-in + custom de AGF_COMPRESS_FILTERS)')
    .action(() => {
      const out = createCliOutput('compress.filters')
      ensureCustomFiltersLoaded()
      out.ok({
        filters: listFilters().map((f) => ({ priority: f.priority, name: f.name })),
        hint: 'Adicione cobertura sob demanda: AGF_COMPRESS_FILTERS=<arquivo.json> (ver docs/examples/compress-filters.example.json).',
      })
    })

  cmd
    .command('discover')
    .description('Saídas sem filtro registradas (rode o agente com AGF_COMPRESS_DISCOVER=1)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--ledger', 'Varre também o llm_call_ledger para estimar savings históricos')
    .action((opts: { dir: string; ledger?: boolean }) => {
      const out = createCliOutput('compress.discover')
      if (opts.ledger) {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const db = store.getDb()
          out.ok(scanLedgerForMissedFilters(db))
        } finally {
          store.close()
        }
        return
      }
      const file = join(resolve(opts.dir), 'workflow-graph', 'compress-discover.json')
      out.ok(loadDiscover(file))
    })

  cmd
    .command('test <file>')
    .description('Mostra qual filtro casaria e quanto comprimiria a saída de <file>')
    .action((file: string) => {
      const out = createCliOutput('compress.test')
      ensureCustomFiltersLoaded()
      let text: string
      try {
        text = readFileSync(resolve(file), 'utf8')
      } catch (err) {
        out.err('FILE_READ_ERROR', `erro ao ler ${file}: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      const filter = detectFilter(text)
      if (!filter) {
        out.ok({
          matched: false,
          bytesBefore: text.length,
          hint: 'Nenhum filtro casou. Candidato a novo filtro/regra declarativa.',
        })
        return
      }
      const r = compressToolOutput(text)
      const pct = text.length > 0 ? parseFloat(((r.saved / text.length) * 100).toFixed(1)) : 0
      out.ok({
        matched: true,
        filterName: filter.name,
        bytesBefore: text.length,
        bytesAfter: r.value.length,
        bytesSaved: r.saved,
        percentSaved: pct,
      })
    })

  cmd
    .command('run')
    .description(
      'Run a command and compress its stdout, or compress stdin (PostToolUse hook). ' +
        "Usage: 'agf compress run -- <cmd>' or pipe: 'cmd | agf compress run --stdin'",
    )
    .option('-d, --dir <dir>', 'Project root (for CCR store)', process.cwd())
    .option('--stdin', 'Read from stdin instead of running a command', false)
    .option('--no-compress', 'Pass through without compression (dry-run)', false)
    .option('--task <id>', 'Poda task-aware condicionada ao node (default: o node in_progress)')
    .allowUnknownOption(true)
    .action(async function (opts: { dir: string; stdin: boolean; compress: boolean; task?: string }) {
      const out = createCliOutput('compress.run')
      // Collect everything after '--' as the child command
      const args = (this as Command).args
      const dashDash = args.indexOf('--')
      const childArgv = dashDash >= 0 ? args.slice(dashDash + 1) : []

      const store = openStoreIfExists(opts.dir)
      const db = store?.getDb() ?? null

      // Sinal da task ativa (Squeez): --task <id> explicita; default = node
      // in_progress; sem grafo/sinal => estagio no-op byte-identico.
      let signal: TaskSignal | null = null
      if (store) {
        if (opts.task) {
          const node = store.getNodeById(opts.task)
          signal = node ? buildSignalFromNode(node) : null
        } else {
          signal = extractTaskSignal(store)
        }
      }

      if (opts.stdin || childArgv.length === 0) {
        // Read from stdin
        const raw = readFileSync('/dev/stdin', 'utf8')
        const base = buildCompressRunPayload(raw, { noCompress: !opts.compress })
        const payload = await applyTaskAwareToPayload(base, signal, { db })
        if (payload.tokens.saved > 0)
          recordCompressRunSavings(db, {
            tokensBefore: payload.tokens.before,
            tokensAfter: payload.tokens.after,
            saved: payload.tokens.saved,
          })
        store?.close()
        out.ok({ ...payload, exitCode: 0 })
        return
      }

      // Run child process
      const result = spawnSync(childArgv[0], childArgv.slice(1), {
        encoding: 'utf8',
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false,
      })
      const raw = (result.stdout ?? '') + (result.stderr ?? '')
      const exitCode = result.status ?? 1
      const base = buildCompressRunPayload(raw, { noCompress: !opts.compress })
      const payload = await applyTaskAwareToPayload(base, signal, { db })
      if (payload.tokens.saved > 0)
        recordCompressRunSavings(db, {
          tokensBefore: payload.tokens.before,
          tokensAfter: payload.tokens.after,
          saved: payload.tokens.saved,
        })
      store?.close()
      out.ok({ ...payload, exitCode })
      process.exitCode = exitCode
    })

  cmd
    .command('trajectory <file>')
    .description(
      'Compress a conversation trajectory JSON (array of turns), removing obsolete tool outputs and resolved errors',
    )
    .action((file: string) => {
      const out = createCliOutput('compress.trajectory')
      let raw: string
      try {
        raw = readFileSync(resolve(file), 'utf8')
      } catch (err) {
        out.err('FILE_READ_ERROR', `erro ao ler ${file}: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      let turns: Turn[]
      try {
        turns = JSON.parse(raw) as Turn[]
      } catch {
        out.err('PARSE_ERROR', 'O arquivo não é JSON válido com array de turns')
        return
      }
      const result = compressTrajectory(turns)
      out.ok({
        turnsBefore: turns.length,
        turnsAfter: result.turns.length,
        tokensRemoved: result.tokensRemoved,
        compressionRatio: result.compressionRatio,
        turns: result.turns,
      })
    })

  return cmd
}
