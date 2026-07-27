#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Showcase ponta a ponta — vitrine completa do produto: percorre o ciclo
 * SHAPE → BUILD → SHIP num diretório TEMPORÁRIO, exercitando o motor
 * determinístico inteiro e os comandos conectados ao núcleo:
 *
 *   SHAPE  import-prd · stats · spec · constitution · preset · gate design
 *   BUILD  kanban · next · autopilot --simulate · insights (dora/bottlenecks/phases)
 *   SHIP   gate review/handoff/deploy/listening · adr create/list · metrics
 *
 * Tudo via `--simulate` / comandos determinísticos: custo de modelo = 0. Prova
 * o fluxo completo PRD → grafo → loop → gates → entrega, sem tocar a rede.
 *
 * Uso: `npm run showcase` (faz build antes) ou `node scripts/showcase.mjs`.
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
  console.error('dist/ ausente — rode `npm run build` primeiro (ou use `npm run demo:full`).')
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'agf-demo-full-'))
let failed = false

const C = { cyan: '\x1b[36m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', reset: '\x1b[0m' }

/** Cabeçalho de fase. */
function phase(name, question) {
  process.stdout.write(`\n${C.bold}${C.yellow}━━━ ${name} ━━━${C.reset} ${C.dim}${question}${C.reset}\n`)
}

/**
 * Roda um subcomando no dir temporário. `allowNonZero` marca passos cujo exit≠0
 * é esperado (ex.: gates que retornam NOT READY num projeto recém-importado).
 */
function step(title, args, { allowNonZero = false } = {}) {
  process.stdout.write(`\n${C.cyan}# ${title}${C.reset}\n`)
  const res = spawnSync('node', [cli, ...args, '--dir', dir], { encoding: 'utf8' })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.status !== 0) {
    if (res.stderr) process.stdout.write(res.stderr)
    if (!allowNonZero) failed = true
    else process.stdout.write(`${C.dim}(exit ${res.status} — esperado neste estágio)${C.reset}\n`)
  }
  return res
}

try {
  console.log(`${C.bold}Showcase agent-graph-flow${C.reset} — projeto temporário em ${C.dim}${dir}${C.reset}`)

  phase('SHAPE', 'O que construir e como decompor?')
  step('import-prd (PRD → grafo de execução)', ['import-prd', prd])
  step('stats (nós por tipo/status)', ['stats'])
  step('spec --list-templates (templates de especificação)', ['spec', '--list-templates'])
  step('constitution --list (princípios governantes)', ['constitution', '--list'])
  step('preset --apply strict-tdd (configura gates/strictness)', ['preset', '--apply', 'strict-tdd'])
  step('gate design (Definition of Ready → PLAN)', ['gate', 'design'], { allowNonZero: true })

  phase('BUILD', 'Construindo com TDD e validando?')
  step('kanban (board + WIP + métricas de fluxo)', ['kanban'])
  step('next (pull da próxima task, WIP=1)', ['next'])
  step('autopilot --simulate (loop + DoD gate, sem modelo)', ['autopilot', '--simulate', '--max', '5'])
  step('insights dora (deployment freq, lead time, CFR, MTTR)', ['insights', 'dora'])
  step('insights bottlenecks (gargalos do grafo)', ['insights', 'bottlenecks'])
  step('insights phases (distribuição por fase)', ['insights', 'phases'])

  phase('SHIP', 'Pronto, entregue, ouvindo feedback?')
  step('gate review', ['gate', 'review'], { allowNonZero: true })
  step('gate handoff', ['gate', 'handoff'], { allowNonZero: true })
  step('gate deploy', ['gate', 'deploy'], { allowNonZero: true })
  step('gate listening', ['gate', 'listening'], { allowNonZero: true })
  step('adr create (registra decisão de arquitetura)', [
    'adr',
    'create',
    'Adotar grafo SQLite local-first',
    '--decision',
    'Persistir execução num grafo SQLite local, sem infra externa',
    '--consequences',
    'Zero dependência de rede; rastreabilidade total; portátil',
  ])
  step('adr list (decisões registradas)', ['adr', 'list'])
  step('metrics (tokens/$ — 0 pois tudo foi determinístico/simulado)', ['metrics'])

  console.log(
    `\n${C.green}${C.bold}✓ Demo profunda concluída.${C.reset} ` +
      `Para o agente real: ${C.bold}agf autopilot --live${C.reset} ou a TUI: ${C.bold}agf tui${C.reset}.`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
