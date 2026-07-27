/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SkillRegistry — registry unificado de comandos (hardcoded + skills dinamicas).
 * Substitui o array COMMANDS fixo por um registro que combina comandos nativos
 * e skills carregadas via skill-loader.
 */
import type { SlashCommandSkill } from './skill-handler-port.js'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/skill-registry.ts' })

const LIFECYCLE_ORDER = [
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
]

export class SkillRegistry {
  private commands: Map<string, SlashCommandSkill> = new Map()

  register(skill: SlashCommandSkill): void {
    log.debug(`register: ${skill.name}`)
    this.commands.set(skill.name, skill)
  }

  find(name: string): SlashCommandSkill | undefined {
    return this.commands.get(name)
  }

  listByPhase(phase: string): SlashCommandSkill[] {
    const result: SlashCommandSkill[] = []
    for (const cmd of this.commands.values()) {
      if (cmd.phase === phase) {
        result.push(cmd)
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  getNext(current: string): SlashCommandSkill | undefined {
    const idx = LIFECYCLE_ORDER.indexOf(current)
    if (idx === -1 || idx >= LIFECYCLE_ORDER.length - 1) return undefined
    const nextPhase = LIFECYCLE_ORDER[idx + 1]
    const skills = this.listByPhase(nextPhase)
    return skills.length > 0 ? skills[0] : undefined
  }

  getAll(): SlashCommandSkill[] {
    return Array.from(this.commands.values())
  }

  hasHandler(name: string): boolean {
    const cmd = this.commands.get(name)
    return cmd?.handler !== undefined
  }

  size(): number {
    return this.commands.size
  }

  /**
   * Returns the name of the first unmet dependency for the given skill,
   * or null if all deps are satisfied (or the skill has none).
   */
  checkDependsOn(name: string): string | null {
    const skill = this.commands.get(name)
    if (!skill?.dependsOn) return null
    for (const dep of skill.dependsOn) {
      if (!this.commands.has(dep)) return dep
    }
    return null
  }
}

/** Creates the default registry with built-in commands. */
export function createDefaultRegistry(): SkillRegistry {
  const registry = new SkillRegistry()

  const builtIns: SlashCommandSkill[] = [
    { name: 'next', usage: '/next', desc: 'Proxima task desbloqueada', phase: 'IMPLEMENT' },
    { name: 'stats', usage: '/stats', desc: 'Contagens do grafo', phase: 'cross-cutting' },
    { name: 'metrics', usage: '/metrics', desc: 'Tokens e custo da sessao', phase: 'cross-cutting' },
    { name: 'run', usage: '/run <prompt>', desc: 'Implementa um prompt (one-shot)', phase: 'IMPLEMENT' },
    { name: 'autopilot', usage: '/autopilot [n]', desc: 'Roda o loop autonomo', phase: 'IMPLEMENT' },
    { name: 'check', usage: '/check <nodeId>', desc: 'DoD check numa task', phase: 'IMPLEMENT' },
    { name: 'decompose', usage: '/decompose', desc: 'Detecta tasks grandes', phase: 'PLAN' },
    { name: 'phase', usage: '/phase', desc: 'Fase atual do projeto', phase: 'cross-cutting' },
    { name: 'model', usage: '/model', desc: 'Modelo ativo (tier-router)', phase: 'cross-cutting' },
    { name: 'import-prd', usage: '/import-prd <file>', desc: 'Importa PRD -> grafo', phase: 'ANALYZE' },
    { name: 'doctor', usage: '/doctor', desc: 'Health check do ambiente', phase: 'cross-cutting' },
    { name: 'skills', usage: '/skills [fase]', desc: 'Lista skills disponiveis', phase: 'cross-cutting' },
    { name: 'skill', usage: '/skill <nome>', desc: 'Exibe instrucoes da skill', phase: 'cross-cutting' },
    { name: 'build', usage: '/build [max]', desc: 'Orquestra a entrega end-to-end', phase: 'DEPLOY' },
    { name: 'generate-prd', usage: '/generate-prd <descricao>', desc: 'Gera um PRD e importa', phase: 'ANALYZE' },
    { name: 'quality', usage: '/quality', desc: 'Gate de qualidade 95/95', phase: 'VALIDATE' },
    { name: 'principles', usage: '/principles', desc: 'O credo de engenharia', phase: 'cross-cutting' },
    { name: 'provider', usage: '/provider', desc: 'Providers de modelo disponiveis', phase: 'cross-cutting' },
    { name: 'kanban', usage: '/kanban [epic:<id>]', desc: 'Kanban board com 5 colunas', phase: 'cross-cutting' },
    { name: 'diff', usage: '/diff', desc: 'Exibe/esconde painel de edicoes', phase: 'IMPLEMENT' },
    { name: 'help', usage: '/help', desc: 'Lista os comandos', phase: 'cross-cutting' },
    { name: 'quit', usage: '/quit', desc: 'Sair da TUI', phase: 'cross-cutting' },
    {
      name: 'graph-navigation',
      usage: '/graph-navigation [--auto]',
      desc: 'Navegacao do grafo em 6 passos (heal/learn/verify/scaffold/boilerplate/dogfood)',
      phase: 'cross-cutting',
    },
    { name: 'cache-stats', usage: '/cache-stats', desc: 'Exibe eficiencia do cache de sessao', phase: 'cross-cutting' },

    // Skills
    { name: 'graph-analyze', usage: '/graph-analyze', desc: 'ANALYZE — PRD, requisitos, DoR', phase: 'ANALYZE' },
    { name: 'graph-prd', usage: '/graph-prd', desc: 'Pre-lifecycle — transforma ideia vaga em PRD', phase: 'ANALYZE' },
    { name: 'graph-design', usage: '/graph-design', desc: 'DESIGN — C4, ADRs, fitness functions', phase: 'DESIGN' },
    { name: 'graph-plan', usage: '/graph-plan', desc: 'PLAN — decomposicao, sprint, estimativas', phase: 'PLAN' },
    {
      name: 'graph-implement',
      usage: '/graph-implement',
      desc: 'IMPLEMENT — TDD Red-Green-Refactor',
      phase: 'IMPLEMENT',
    },
    { name: 'graph-bugs', usage: '/graph-bugs', desc: 'Bug discovery + structured fix via 5-Whys', phase: 'IMPLEMENT' },
    {
      name: 'graph-validate',
      usage: '/graph-validate',
      desc: 'VALIDATE — E2E tests, AC quality, DORA',
      phase: 'VALIDATE',
    },
    {
      name: 'graph-platform',
      usage: '/graph-platform',
      desc: 'Platform audit — web vitals, a11y, harness',
      phase: 'VALIDATE',
    },
    {
      name: 'graph-review',
      usage: '/graph-review',
      desc: 'REVIEW — blast radius, API contracts, mermaid',
      phase: 'REVIEW',
    },
    { name: 'graph-security', usage: '/graph-security', desc: 'Security audit — OWASP, STRIDE, SBOM', phase: 'REVIEW' },
    { name: 'graph-quality', usage: '/graph-quality', desc: 'Refactoring audit — SOLID, DRY, McCabe', phase: 'REVIEW' },
    {
      name: 'graph-handoff',
      usage: '/graph-handoff',
      desc: 'HANDOFF — PR, snapshot, knowledge export',
      phase: 'HANDOFF',
    },
    { name: 'graph-deploy', usage: '/graph-deploy', desc: 'DEPLOY — release health, CI pipeline', phase: 'DEPLOY' },
    {
      name: 'graph-listening',
      usage: '/graph-listening',
      desc: 'LISTENING — retrospective, CFD, feedback',
      phase: 'LISTENING',
    },
    {
      name: 'graph-heal',
      usage: '/graph-heal',
      desc: 'Cross-cutting — auto-cura MAPE-K + navegacao',
      phase: 'cross-cutting',
    },
    { name: 'browser', usage: '/browser <subcomando>', desc: 'Browser harness — comandos CDP', phase: 'cross-cutting' },
    {
      name: 'decompose-prd',
      usage: '/decompose-prd [epicId]',
      desc: 'Decompoe PRD em subtasks XS/S com AC',
      phase: 'ANALYZE',
    },
    { name: 'to-prd', usage: '/to-prd <descricao>', desc: 'Sintetiza contexto em PRD draft', phase: 'ANALYZE' },
    {
      name: 'plan-sprint',
      usage: '/plan-sprint [horas] [focus]',
      desc: 'Planeja sprint com capacidade + WIP=1',
      phase: 'PLAN',
    },
    {
      name: 'tracer-bullet-tdd',
      usage: '/tracer-bullet-tdd [nodeId]',
      desc: 'TDD tracer bullet — uma fatia por todas camadas',
      phase: 'IMPLEMENT',
    },
    {
      name: 'dod-checklist',
      usage: '/dod-checklist [nodeId]',
      desc: 'Definition of Done — 9 checks explicitos',
      phase: 'VALIDATE',
    },
    {
      name: 'harness-regression-check',
      usage: '/harness-regression-check [--save]',
      desc: 'Compara harness scores antes/depois',
      phase: 'VALIDATE',
    },
    {
      name: 'deep-module-review',
      usage: '/deep-module-review [dir]',
      desc: 'Audita depth ratio + surface de modulo',
      phase: 'REVIEW',
    },
    {
      name: 'zoom-out',
      usage: '/zoom-out <arquivo | dir>',
      desc: 'Sobe um nivel de abstracao — mapa de callers + deps',
      phase: 'REVIEW',
    },
  ]

  for (const cmd of builtIns) {
    registry.register(cmd)
  }
  return registry
}
