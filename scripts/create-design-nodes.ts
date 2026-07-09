/**
 * Script DESIGN phase — cria ADRs, decisions e constraints de arquitetura
 * para o Epic "Skills-via-Slash-Commands"
 */
import { SqliteStore } from '../src/core/store/sqlite-store.js'

async function main() {
  const store = SqliteStore.open(process.cwd())
  const now = '2026-06-05T15:00:00Z'

  const decisions = [
    {
      id: 'adr-001-skill-handler-port',
      type: 'decision' as const,
      title: 'ADR-001: SkillHandlerPort — skills executáveis',
      description: `
## Status: Accepted
## Context: Skills atualmente são markdown estático. A TUI mostra o texto mas não executa nada.
## Decision: Criar interface SkillHandlerPort com execute(args, ctx) que transforma cada skill em handler executável. Skills são registradas em SkillRegistry unificado.
## Consequences: 
- Skills viram comandos reais na TUI
- Testáveis isoladamente via fake context
- Progresso granular (SkillStep) visível na TUI durante execução
- Zero quebra de compatibilidade com COMMANDS existentes
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m1-core-engine',
    },
    {
      id: 'adr-002-component-tui',
      type: 'decision' as const,
      title: 'ADR-002: Arquitetura de componentes Ink no TUI',
      description: `
## Status: Accepted
## Context: TUI atual tem dashboard simples. Precisa de kanban, diffs, harness widget, phase indicator, progress bar.
## Decision: Cada visualização é um componente Ink puro e testável. Componentes recebem dados via props (presentational), sem acesso direto ao store. Container (InteractiveApp) gerencia estado e dispatch.
## Consequences:
- Componentes testáveis via ink-testing-library
- Separação clara entre dados (model.ts) e visualização (components/)
- Lazy rendering com useMemo para evitar flickering
- KanbanBoard usa virtualização se >100 cards
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m2-tui-visualizacao',
    },
    {
      id: 'adr-003-deterministic-first',
      type: 'decision' as const,
      title: 'ADR-003: Deterministic-first — zero LLM nos handlers',
      description: `
## Status: Accepted
## Context: Redução de token e prevenção de alucinação. Skills não devem chamar LLM para decisões.
## Decision: Handlers de skill operam via grafo traversal e state machines determinísticas. LLM reservado apenas para implementação de código (fase IMPLEMENT). Decisões de orquestração são puramente determinísticas.
## Consequences:
- Token-frugal: handlers custam zero tokens de LLM
- Sem alucinação nas decisões de fluxo
- Previsível e testável
- Orquestrador (orchestrator.ts) decide próximo passo sem LLM
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-slash-commands',
    },
    {
      id: 'adr-004-lifecycle-pipeline',
      type: 'decision' as const,
      title: 'ADR-004: Lifecycle pipeline como máquina de estados',
      description: `
## Status: Accepted
## Context: Projeto tem 9 fases de lifecycle. Transições precisam de gates validados antes de avançar.
## Decision: Estender orchestrator.ts com lifecycle-pipeline.ts — máquina de estados que gerencia as 9 fases e seus gates. Cada transição valida o gate correspondente antes de avançar.
## Consequences:
- 8 transições mapeadas com gates (design_ready, validate_ready, done_integrity, review_ready, handoff_ready, deploy_ready, release_check)
- /build orquestra pipeline completa
- Gates falhos pausam e reportam
- Integração com SkillExecutionContext para encadeamento de skills
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m3-orquestracao-e2e',
    },
    {
      id: 'adr-005-reuse-first',
      type: 'decision' as const,
      title: 'ADR-005: Reuse-first — scaffold a partir de contratos e cache',
      description: `
## Status: Accepted
## Context: Projeto já tem módulos de scaffold (5 scaffolders) e reuso (artifact-cache, resolve-reuse, task-signature). Não estão expostos como slash commands.
## Decision: /scaffold comando que gera esqueleto a partir de contratos, verifica cache de reuso por task-signature, e oferece importar artifacts similares antes de gerar código novo.
## Consequences:
- Redução de código novo gerado (reuso > geração)
- Cache de artifacts indexado por task-signature
- Score de similaridade para sugestões
- Integração com src/core/scaffolder/ e src/core/reuse/
`.trim(),
      status: 'backlog' as const,
      priority: 2 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m3-orquestracao-e2e',
    },
  ]

  const interfaceConstraints = [
    {
      id: 'iface-skill-handler-port',
      type: 'constraint' as const,
      title: 'Interface: SkillHandlerPort',
      description: `
Contracts between skill handlers and the TUI dispatch system.
- execute(args: string, ctx: SkillExecutionContext): Promise<string>
- SkillExecutionContext: { store, ledger, dir, testCmd, signal, onProgress }
- SkillStep: { step, total, label, elapsed, tokens }
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m1-core-engine',
    },
    {
      id: 'iface-skill-registry',
      type: 'constraint' as const,
      title: 'Interface: SkillRegistry',
      description: `
Contracts for the unified command registry.
- register(skill: SkillCommand): void
- find(name: string): SkillCommand | undefined
- listByPhase(phase: LifecyclePhase): SkillCommand[]
- getNext(current: string): SkillCommand | undefined
- setPreset(preset: string): void
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m1-core-engine',
    },
    {
      id: 'iface-kanban-component',
      type: 'constraint' as const,
      title: 'Interface: KanbanBoard component props',
      description: `
Contracts for the KanbanBoard Ink component.
- Props: { nodes: GraphNode[], edges: GraphEdge[], onMoveCard: (nodeId, newStatus) => void }
- Columns: 5 (backlog, ready, in_progress, blocked, done)
- Swimlanes: optional grouping by epic or sprint
- WIP limits: configurable per column, red indicator when exceeded
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m2-tui-visualizacao',
    },
    {
      id: 'iface-lifecycle-pipeline',
      type: 'constraint' as const,
      title: 'Interface: LifecyclePipeline',
      description: `
Contracts for the lifecycle state machine.
- LifecyclePhase: ANALYZE | DESIGN | PLAN | IMPLEMENT | VALIDATE | REVIEW | HANDOFF | DEPLOY | LISTENING
- GateFn: (state: DeliveryState) => { passed: boolean, score: number, missing: string[] }
- nextPhase(current: LifecyclePhase): LifecyclePhase | null
- validateGate(phase: LifecyclePhase, state: DeliveryState): GateResult
`.trim(),
      status: 'backlog' as const,
      priority: 1 as const,
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-m3-orquestracao-e2e',
    },
  ]

  console.log('── DESIGN: Criando ADRs ──')
  for (const d of decisions) {
    try {
      store.insertNode(d as any)
      console.log(`  ✓ ${d.id}: ${d.title}`)
    } catch (err: any) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('unique')) {
        console.log(`  ~ ${d.id}: ja existe`)
      } else {
        console.error(`  ✗ ${d.id}: ${err.message}`)
        throw err
      }
    }
  }

  console.log('\n── DESIGN: Criando Interface Contracts ──')
  for (const c of interfaceConstraints) {
    try {
      store.insertNode(c as any)
      console.log(`  ✓ ${c.id}: ${c.title}`)
    } catch (err: any) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('unique')) {
        console.log(`  ~ ${c.id}: ja existe`)
      } else {
        console.error(`  ✗ ${c.id}: ${err.message}`)
        throw err
      }
    }
  }

  // ── Edges: ADRs → Epics ──
  console.log('\n── DESIGN: Criando edges ──')
  const edges = [
    {
      id: 'e-adr-001-to-m1',
      from: 'adr-001-skill-handler-port',
      to: 'epic-m1-core-engine',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-adr-002-to-m2',
      from: 'adr-002-component-tui',
      to: 'epic-m2-tui-visualizacao',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-adr-003-to-parent',
      from: 'adr-003-deterministic-first',
      to: 'epic-slash-commands',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-adr-004-to-m3',
      from: 'adr-004-lifecycle-pipeline',
      to: 'epic-m3-orquestracao-e2e',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-adr-005-to-m3',
      from: 'adr-005-reuse-first',
      to: 'epic-m3-orquestracao-e2e',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-iface-1-to-m1',
      from: 'iface-skill-handler-port',
      to: 'epic-m1-core-engine',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-iface-2-to-m1',
      from: 'iface-skill-registry',
      to: 'epic-m1-core-engine',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-iface-3-to-m2',
      from: 'iface-kanban-component',
      to: 'epic-m2-tui-visualizacao',
      relationType: 'related_to',
      createdAt: now,
    },
    {
      id: 'e-iface-4-to-m3',
      from: 'iface-lifecycle-pipeline',
      to: 'epic-m3-orquestracao-e2e',
      relationType: 'related_to',
      createdAt: now,
    },
  ]

  for (const e of edges) {
    try {
      store.insertEdge(e as any)
    } catch (err: any) {
      if (!err.message?.includes('UNIQUE') && !err.message?.includes('unique')) {
        console.error(`  ✗ ${e.id}: ${err.message}`)
      }
    }
  }
  console.log(`  ✓ ${edges.length} edges criados`)

  // ── Set phase ──
  store.setProjectSetting('currentPhase', 'PLAN')
  console.log('\n✓ DESIGN concluído → fase PLAN')

  const stats = store.getStats()
  console.log(
    `Total: ${stats.totalNodes} nodes | ${Object.entries(stats.byStatus)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  )

  store.close()
}

main().catch((err) => {
  console.error('Erro:', err)
  process.exit(1)
})
