#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Demo ponta a ponta (M1t) — exercita o pipeline determinístico num diretório
 * TEMPORÁRIO (não polui o repo): import-prd → stats → next → autopilot --simulate
 * → metrics, sobre `docs/examples/sample-prd.md`. Usa `--simulate` (não chama o
 * Copilot), então prova o fluxo PRD→grafo→loop→gate; o custo de modelo é 0.
 *
 * Uso: `npm run demo` (faz build antes) ou `node scripts/demo.mjs` (requer dist/).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'dist', 'cli', 'index.js')
const prd = join(root, 'docs', 'examples', 'sample-prd.md')

if (!existsSync(cli)) {
  console.error('dist/ ausente — rode `npm run build` primeiro (ou use `npm run demo`).')
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'agf-demo-'))
let failed = false

/** Roda um subcomando do CLI no dir temporário, ecoando título + saída. */
function step(title, args) {
  process.stdout.write(`\n\x1b[36m# ${title}\x1b[0m\n`)
  const res = spawnSync('node', [cli, ...args, '--dir', dir], { encoding: 'utf8' })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.status !== 0) {
    if (res.stderr) process.stdout.write(res.stderr)
    failed = true
  }
  return res
}

try {
  console.log(`Demo agent-graph-flow — projeto temporário em ${dir}`)
  step('import-prd (PRD → grafo)', ['import-prd', prd])
  step('stats (nós por tipo/status)', ['stats'])
  step('next (pull da próxima task, WIP=1)', ['next'])
  step('autopilot --simulate (loop + DoD gate, sem chamar modelo)', ['autopilot', '--simulate', '--max', '5'])
  step('metrics (tokens/$ — 0 pois --simulate não chama o Copilot)', ['metrics'])
  console.log('\n\x1b[32m✓ Demo concluída.\x1b[0m Para o agente real: `agf autopilot --live` ou a TUI: `agf tui`.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
