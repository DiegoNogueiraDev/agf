/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { buildAuthoringGroup } from './authoring-group.js'
import { commands } from '../commands-list.js'

const log = createLogger({ layer: 'cli', source: 'help-cmd.ts' })

interface Group {
  title: string
  items: Array<{ cmd: string; desc: string }>
}

/** Comandos-raiz efetivamente registrados — a fonte da disponibilidade. */
const REGISTERED = new Set<string>(commands.map((c) => c.name))

const GROUPS: Group[] = [
  {
    title: 'Começar (o caminho feliz)',
    items: [
      {
        cmd: 'genesis "<ideia>"',
        desc: 'criar projeto do zero: ideia → grafo → primeiro brief em 1 round-trip (--review pausa no PRD)',
      },
      { cmd: 'deliver "<pedido>"', desc: 'pedido → PRD → grafo → build TDD, autônomo (texto, --file ou --image)' },
      { cmd: 'status', desc: 'painel: provider, modelo, cache, tokens/$ e economia' },
      { cmd: 'tui', desc: 'TUI interativa (dashboard + slash-commands + autopilot ao vivo)' },
    ],
  },
  {
    title: 'Provider & modelo (multi-provider, economia)',
    items: [
      {
        cmd: 'provider use <id> [--base-url <url>]',
        desc: 'escolhe o provider (ollama/openrouter/…); --base-url p/ servidor local ($0)',
      },
      { cmd: 'provider current', desc: 'mostra o provider/endpoint ativos' },
      { cmd: 'model set <id|auto>', desc: 'fixa o modelo (ex.: qwen2.5-coder:14b) ou roteia por tarefa' },
      { cmd: 'login / logout', desc: 'autentica no GitHub Copilot (device-flow ou --token)' },
      { cmd: 'metrics', desc: 'tokens/$ por task e sessão (+ economia de cache e custo-por-sucesso)' },
    ],
  },
  {
    title: 'Fluxo manual (controle fino)',
    items: [
      { cmd: 'generate-prd "<desc>" [--import]', desc: 'gera um PRD do texto (e importa)' },
      { cmd: 'import-prd <arquivo>', desc: 'importa PRD (md/pdf/html/docx) → grafo' },
      { cmd: 'next', desc: 'puxa a próxima task desbloqueada (pull, WIP=1)' },
      { cmd: 'build [--live]', desc: 'orquestra PRD.md → grafo → decompõe → autopilot' },
      { cmd: 'autopilot [--simulate|--live|--swarm]', desc: 'loop autônomo com guardrails (TDD/DoD)' },
      { cmd: 'ant spawn <id>', desc: 'spawnar formiga (worktree isolado) p/ paralelismo da colônia' },
      { cmd: 'run "<prompt>"', desc: 'execução one-shot ad-hoc (gera → aplica → testa)' },
    ],
  },
  {
    title: 'Projeto & qualidade',
    items: [
      { cmd: 'init', desc: 'inicializa o projeto' },
      { cmd: 'doctor [--providers]', desc: 'diagnóstico do ambiente + contexto LLM ativo' },
      { cmd: 'stats', desc: 'contagens do grafo (nós/edges por tipo e status)' },
      { cmd: 'quality / harness', desc: 'gate 95/95 e score de agent-readiness' },
    ],
  },
  // Autoria por último: é o passo que vem DEPOIS de operar o ciclo uma vez.
  buildAuthoringGroup(REGISTERED),
]

/** Exposto para o teste de superfície: o índice precisa ser inspecionável. */
export const HELP_GROUPS: ReadonlyArray<Group> = GROUPS

/** Builds the `agf help` CLI command (Commander definition). */
export function helpCommand(): Command {
  log.info('help command registered')
  return new Command('help').description('Índice amigável de comandos (visão geral + primeiros passos)').action(() => {
    const out = createCliOutput('help')
    out.ok({
      tagline: 'agf — agente que entrega software rápido, com práticas de engenharia e custo de token baixo.',
      groups: GROUPS,
      gettingStarted: [
        '1) Modelo local (grátis):  agf provider use ollama --base-url http://SEU_IP:11434/v1 && agf model set <modelo>',
        '   ou Copilot:             agf login',
        '2) Entregue:               agf deliver "crie um kanban com colunas a fazer/fazendo/feito"',
        '3) Acompanhe:              agf status   (ou abra a TUI: agf tui)',
      ],
      hint: 'Detalhe de um comando: agf <comando> --help',
    })
  })
}
