/**
 * Script para criar nodes no grafo: Epic "v0.15 — Coverage + Spec-kit Tools"
 * Cobre os gaps P0/P1 encontrados na investigacao:
 * - Ajustar coverage thresholds (70% -> 10-15% interim)
 * - Implementar spec_sync tool (zero codigo)
 * - Implementar agent_format tool (zero codigo)
 * - CLI commands para constitution, plugin, preset, spec
 * - Testes no validator/ (528 linhas, 0% coverage)
 * - Testes no agent-driver/utils/ (0% coverage)
 */
import { SqliteStore } from '../src/core/store/sqlite-store.js'

async function main() {
  const store = SqliteStore.open(process.cwd())

  if (!store.getProject()) {
    store.initProject('agent-graph-flow')
  }

  const now = new Date().toISOString()

  const parentEpic = {
    id: 'epic-v015-coverage-spec-kit',
    type: 'epic' as const,
    title: 'v0.15 — Coverage thresholds + Spec-kit Tools (spec_sync, agent_format) + CLI surface',
    description:
      'Resolver gaps P0/P1: ajustar coverage thresholds realistas, implementar spec_sync e agent_format (zero codigo), criar CLI commands para constitution/plugin/preset/spec, e backfill de testes em validator/ e agent-driver/utils/.',
    status: 'backlog' as const,
    priority: 1 as const,
    xpSize: 'L' as const,
    estimateMinutes: 480,
    tags: ['v0.15', 'coverage', 'spec-kit', 'tests', 'cli'],
    acceptanceCriteria: [
      'Coverage thresholds ajustados para 10-15% interim (refletindo cobertura real)',
      'spec_sync tool implementado (sync, status, history, link — 4 acoes)',
      'agent_format tool implementado (generate, list_formats, list_agents — 3 acoes)',
      'CLI commands para constitution, plugin, preset, spec criados e registrados',
      'Validator module com >=70% coverage (528 linhas -> testado)',
      'Agent-driver/utils/ com >=50% coverage (errors, fs, grading, memory-guard)',
      'Zero regressoes — 428+ testes passando',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v015',
    metadata: { methodology: 'TDD', preset: 'strict-tdd', wip: 1, totalTasks: 8 },
  }

  const tasks = [
    {
      id: 'v015-t1-coverage-thresholds',
      type: 'task' as const,
      title: 'v0.15.T1 — Ajustar coverage thresholds (70% -> 10-15% interim)',
      description:
        'vitest.config.ts exige 70/65/70/70 mas cobertura real e ~7%. Ajustar para valores realistas que o projeto consegue atingir hoje.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'XS',
      estimateMinutes: 30,
      tags: ['coverage', 'config'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        'Thresholds ajustados para 10% statements, 8% branches, 10% functions, 10% lines',
        'vitest run --coverage nao falha por threshold',
        'Thresholds documentados como interim (target: subir gradualmente)',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
    {
      id: 'v015-t2-spec-sync',
      type: 'task' as const,
      title: 'v0.15.T2 — Implementar spec_sync tool (sync, status, history, link)',
      description:
        'spec_sync documentado no AGENTS.md com 4 acoes mas zero implementacao. Criar modulo em src/core/spec-evolution/ com as 4 operacoes.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'M',
      estimateMinutes: 120,
      tags: ['spec-kit', 'spec_sync'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        'spec_sync.sync() — sincroniza spec com nodes do grafo',
        'spec_sync.status() — retorna status de sync (stale, synced, diverged)',
        'spec_sync.history() — historico de versoes da spec',
        'spec_sync.link() — conecta spec com nodes (derived_from, implements, validates)',
        'Testes unitarios para cada acao',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
    {
      id: 'v015-t3-agent-format',
      type: 'task' as const,
      title: 'v0.15.T3 — Implementar agent_format tool (generate, list_formats, list_agents)',
      description:
        'agent_format documentado com 3 acoes mas zero implementacao. Criar modulo em src/core/spec-templates/ com as 3 operacoes.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'M',
      estimateMinutes: 90,
      tags: ['spec-kit', 'agent_format'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        'agent_format.generate() — gera instrucoes para AI agent no formato solicitado',
        'agent_format.list_formats() — lista formatos disponiveis (markdown, TOML, skill.md, JSON)',
        'agent_format.list_agents() — lista 6+ agent types suportados',
        'Testes unitarios para cada acao',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
    {
      id: 'v015-t4-spec-kit-cli',
      type: 'task' as const,
      title: 'v0.15.T4 — CLI commands para constitution, plugin, preset, spec',
      description: '4 spec-kit tools tem core mas sem CLI surface. Criar comandos CLI e registrar no index.ts.',
      status: 'backlog' as const,
      priority: 2,
      xpSize: 'M',
      estimateMinutes: 90,
      tags: ['cli', 'spec-kit'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        '/constitution create|list|check funcional via CLI',
        '/plugin install|remove|enable|disable|list|info funcional via CLI',
        '/preset list|apply|show|create funcional via CLI',
        '/spec generate|validate|list_templates funcional via CLI',
        '4 comandos registrados em src/cli/index.ts',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
    {
      id: 'v015-t5-validator-tests',
      type: 'task' as const,
      title: 'v0.15.T5 — Backfill testes no validator/ (528 linhas, 0% -> >=70%)',
      description:
        'src/core/validator/ tem 5 arquivos com zero cobertura. Cobrir definition-of-ready, done-integrity-checker, edge-consistency-checker, status-flow-checker, validation.ts.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'M',
      estimateMinutes: 120,
      tags: ['tests', 'validator', 'coverage'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        'definition-of-ready.test.ts — >=3 cenarios de DoR',
        'done-integrity-checker.test.ts — >=3 cenarios de DoD',
        'status-flow-checker.test.ts — validacao de fluxo de status',
        'edge-consistency-checker.test.ts — validacao de edges',
        'Coverage do validator/ >= 70%',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
    {
      id: 'v015-t6-agent-utils-tests',
      type: 'task' as const,
      title: 'v0.15.T6 — Backfill testes no agent-driver/utils/ (0% -> >=50%)',
      description:
        'src/core/agent-driver/utils/ tem arquivos criticos sem cobertura. Cobrir errors.ts, fs.ts, grading.ts, memory-guard.ts, safe-path.ts.',
      status: 'backlog' as const,
      priority: 2,
      xpSize: 'S',
      estimateMinutes: 90,
      tags: ['tests', 'agent-driver', 'coverage'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        'errors.test.ts — erros tipados do agent-driver',
        'safe-path.test.ts — validacao de path traversal',
        'memory-guard.test.ts — guards de memoria',
        'Coverage do agent-driver/utils/ >= 50%',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
    {
      id: 'v015-t7-mcp-tests',
      type: 'task' as const,
      title: 'v0.15.T7 — Backfill testes no mcp/init-project.ts (614 linhas, 0%)',
      description:
        'init-project.ts e o entry point de inicializacao — 614 linhas sem testes. Cobrir fluxos principais.',
      status: 'backlog' as const,
      priority: 2,
      xpSize: 'S',
      estimateMinutes: 60,
      tags: ['tests', 'mcp', 'coverage'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        'init-project.test.ts cobre runInit e runUpdate',
        'writeMcpJson testado com e sem config existente',
        'Coverage do mcp/ >= 40%',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
    {
      id: 'v015-t8-regression',
      type: 'task' as const,
      title: 'v0.15.T8 — Full regression test suite (>=470 passando)',
      description: 'Rodar suite completa, garantir zero regressoes, verificar novos thresholds de coverage.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'XS',
      estimateMinutes: 30,
      tags: ['tests', 'regression'],
      parentId: 'epic-v015-coverage-spec-kit',
      acceptanceCriteria: [
        'Full test suite >= 470 passando',
        'Coverage atende novos thresholds (10/8/10/10)',
        'Nenhum comando CLI quebrado',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v015',
    },
  ]

  const riskNodes = [
    {
      id: 'risk-v015-coverage-regression',
      type: 'risk' as const,
      status: 'backlog' as const,
      priority: 1,
      title: 'Risco: Baixar thresholds pode esconder regressao de coverage',
      description:
        'Ao baixar thresholds de 70% para 10%, testes que perdem coverage nao serao detectados. Mitigacao: thresholds sao interim, subir gradualmente.',
      createdAt: now,
      updatedAt: now,
      metadata: { severity: 'low', mitigation: 'thresholds interim, monitorar tendencia' },
      parentId: 'epic-v015-coverage-spec-kit',
    },
    {
      id: 'risk-v015-spec-sync-complexity',
      type: 'risk' as const,
      status: 'backlog' as const,
      priority: 2,
      title: 'Risco: spec_sync depende de grafo populado com specs',
      description:
        'spec_sync.link() conecta specs com nodes — se nao houver specs no grafo, a ferramenta e inutil. Mitigacao: spec_sync.sync() cria specs a partir de nodes existentes.',
      createdAt: now,
      updatedAt: now,
      metadata: { severity: 'medium', mitigation: 'sync cria specs de nodes existentes' },
      parentId: 'epic-v015-coverage-spec-kit',
    },
  ]

  const constraints = [
    {
      id: 'constraint-v015-tdd',
      type: 'constraint' as const,
      status: 'backlog' as const,
      priority: 1,
      title: 'Constraint: TDD obrigatorio — teste antes do codigo',
      description: 'Toda task segue Red->Green->Refactor. Teste antes do codigo. Sem teste = sem implementacao.',
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-v015-coverage-spec-kit',
    },
  ]

  const allNodes = [parentEpic, ...tasks, ...riskNodes, ...constraints]

  const edges: Array<Record<string, unknown>> = []

  for (const t of tasks) {
    edges.push({
      id: `e-${t.id}-parent`,
      from: t.id,
      to: 'epic-v015-coverage-spec-kit',
      relationType: 'child_of',
      createdAt: now,
    })
  }

  edges.push(
    {
      id: 'e-dep-t2-after-t1',
      from: 'v015-t2-spec-sync',
      to: 'v015-t1-coverage-thresholds',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t3-after-t2',
      from: 'v015-t3-agent-format',
      to: 'v015-t2-spec-sync',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t4-after-t3',
      from: 'v015-t4-spec-kit-cli',
      to: 'v015-t3-agent-format',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t8-after-t5',
      from: 'v015-t8-regression',
      to: 'v015-t5-validator-tests',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t8-after-t6',
      from: 'v015-t8-regression',
      to: 'v015-t6-agent-utils-tests',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t8-after-t7',
      from: 'v015-t8-regression',
      to: 'v015-t7-mcp-tests',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t8-after-t4',
      from: 'v015-t8-regression',
      to: 'v015-t4-spec-kit-cli',
      relationType: 'depends_on',
      createdAt: now,
    },
  )

  for (const r of riskNodes) {
    edges.push({
      id: `e-${r.id}-parent`,
      from: r.id,
      to: 'epic-v015-coverage-spec-kit',
      relationType: 'related_to',
      createdAt: now,
    })
  }
  for (const c of constraints) {
    edges.push({
      id: `e-${c.id}-parent`,
      from: c.id,
      to: 'epic-v015-coverage-spec-kit',
      relationType: 'related_to',
      createdAt: now,
    })
  }

  for (const node of allNodes) {
    try {
      store.insertNode(node as any)
      console.log(`  ✓ ${node.id}: ${(node as any).title}`)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        console.log(`  ~ ${node.id}: ja existe, pulando`)
      } else {
        console.error(`  ✗ ${node.id}: ${msg}`)
        throw err
      }
    }
  }
  for (const edge of edges) {
    try {
      store.insertEdge(edge as any)
    } catch (err) {
      const msg = (err as Error).message
      if (!msg.includes('UNIQUE') && !msg.includes('unique')) {
        console.error(`  ✗ edge ${edge.id}: ${msg}`)
        throw err
      }
    }
  }

  const stats = store.getStats()
  console.log(`\n✓ Criado: ${allNodes.length} nodes, ${edges.length} edges`)
  console.log(`  Epic: 1, Tasks: ${tasks.length}, Risks: ${riskNodes.length}, Constraints: ${constraints.length}`)
  console.log(`  Total no grafo: ${stats.totalNodes} nodes`)

  store.close()
}

main().catch((err) => {
  console.error('Erro:', err)
  process.exit(1)
})
