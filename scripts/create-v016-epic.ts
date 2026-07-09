/**
 * Script para criar nodes no grafo: Epic "v0.16 — Final Polish"
 * Cobre os 3 gaps restantes:
 * - CLI docs no CLAUDE.md (17 comandos nao documentados)
 * - Tiered/deferred tools RFC 6.2/6.4
 * - E2E validation framework
 */
import { SqliteStore } from '../src/core/store/sqlite-store.js'

async function main() {
  const store = SqliteStore.open(process.cwd())
  if (!store.getProject()) store.initProject('agent-graph-flow')
  const now = new Date().toISOString()

  const parentEpic = {
    id: 'epic-v016-final-polish',
    type: 'epic' as const,
    title: 'v0.16 — Final Polish: CLI docs, tiered tools, E2E framework',
    description:
      'Fechar os 3 ultimos gaps: documentar todos os 32 comandos CLI no CLAUDE.md, implementar tiered/deferred tools (RFC 6.2/6.4), criar E2E validation framework para CI/CD.',
    status: 'backlog' as const,
    priority: 1,
    xpSize: 'M' as const,
    estimateMinutes: 300,
    tags: ['v0.16', 'docs', 'tools', 'e2e', 'polish'],
    acceptanceCriteria: [
      'CLAUDE.md documenta todos os 32 comandos CLI',
      'TieredModelClient suporta respostas tiered (cheap->mid->expensive fallback)',
      'Deferred tool execution implementado (queue + resolve later)',
      'E2E validation framework: smoke tests que rodam em CI sem auth',
      'Zero regressoes — 474+ testes passando',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v016',
    metadata: { methodology: 'TDD', preset: 'strict-tdd', wip: 1, totalTasks: 4 },
  }

  const tasks = [
    {
      id: 'v016-t1-cli-docs',
      type: 'task' as const,
      title: 'v0.16.T1 — Documentar 32 comandos CLI no CLAUDE.md',
      description:
        'CLAUDE.md lista 15 comandos mas existem 32 registrados. Documentar os 17 faltantes: init, daemon, doctor, gc, skill, profile, principles, generate-prd, build, quality, ui, provider, harness, constitution, plugin, preset, spec.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'S',
      estimateMinutes: 45,
      tags: ['docs', 'cli'],
      parentId: 'epic-v016-final-polish',
      acceptanceCriteria: [
        'CLAUDE.md reference section lista todos os 32 comandos com descricao',
        'Cada comando tem exemplo de uso de 1 linha',
        'Agrupado por categoria (core, quality, spec-kit, config)',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v016',
    },
    {
      id: 'v016-t2-tiered-tools',
      type: 'task' as const,
      title: 'v0.16.T2 — Implementar tiered/deferred tools (RFC 6.2/6.4)',
      description:
        'RFC 6.2: tiered model responses — fallback chain cheap->mid->expensive quando modelo falha. RFC 6.4: deferred tool execution — queue tools para execucao assincrona com resolve posterior.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'M',
      estimateMinutes: 120,
      tags: ['tools', 'llm', 'tiered'],
      parentId: 'epic-v016-final-polish',
      acceptanceCriteria: [
        'TieredToolExecutor com fallback chain cheap->mid->expensive',
        'DeferredToolQueue com enqueue/dequeue/resolve',
        'Integracao com TieredModelClient existente',
        'Testes unitarios para tiered fallback e deferred queue',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v016',
    },
    {
      id: 'v016-t3-e2e-framework',
      type: 'task' as const,
      title: 'v0.16.T3 — E2E validation framework para CI/CD',
      description:
        'Criar smoke suite de E2E que valida o sistema sem auth real. Testes que rodam em CI: CLI help, smoke tests, harness scan, typecheck, lint.',
      status: 'backlog' as const,
      priority: 2,
      xpSize: 'S',
      estimateMinutes: 60,
      tags: ['e2e', 'ci', 'testing'],
      parentId: 'epic-v016-final-polish',
      acceptanceCriteria: [
        'E2E smoke test: CLI --help funciona em todos os 32 comandos',
        'E2E smoke test: harness:scan produz output valido',
        'E2E smoke test: smoke suite (5 symlinks) passa',
        'Script CI: npm run ci:smoke adicionado ao package.json',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v016',
    },
    {
      id: 'v016-t4-regression',
      type: 'task' as const,
      title: 'v0.16.T4 — Full regression (>=490 passando)',
      description: 'Suite completa, zero regressoes, TypeScript limpo, coverage passando.',
      status: 'backlog' as const,
      priority: 1,
      xpSize: 'XS',
      estimateMinutes: 30,
      tags: ['tests', 'regression'],
      parentId: 'epic-v016-final-polish',
      acceptanceCriteria: [
        'Full test suite >= 490 passando',
        'TypeScript --noEmit limpo',
        'Coverage thresholds passam',
      ],
      createdAt: now,
      updatedAt: now,
      sprint: 'Sprint-v016',
    },
  ]

  const allNodes = [parentEpic, ...tasks]
  const edges: Array<Record<string, unknown>> = []

  for (const t of tasks) {
    edges.push({
      id: `e-${t.id}-parent`,
      from: t.id,
      to: 'epic-v016-final-polish',
      relationType: 'child_of',
      createdAt: now,
    })
  }
  edges.push(
    {
      id: 'e-dep-t4-after-t1',
      from: 'v016-t4-regression',
      to: 'v016-t1-cli-docs',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t4-after-t2',
      from: 'v016-t4-regression',
      to: 'v016-t2-tiered-tools',
      relationType: 'depends_on',
      createdAt: now,
    },
    {
      id: 'e-dep-t4-after-t3',
      from: 'v016-t4-regression',
      to: 'v016-t3-e2e-framework',
      relationType: 'depends_on',
      createdAt: now,
    },
  )

  for (const node of allNodes) {
    try {
      store.insertNode(node as any)
      console.log(`  ✓ ${node.id}: ${(node as any).title}`)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('UNIQUE') || msg.includes('unique')) console.log(`  ~ ${node.id}: ja existe, pulando`)
      else {
        console.error(`  ✗ ${node.id}: ${msg}`)
        throw err
      }
    }
  }
  for (const edge of edges) {
    try {
      store.insertEdge(edge as any)
    } catch {
      /* dup skip */
    }
  }

  const stats = store.getStats()
  console.log(`\n✓ Criado: ${allNodes.length} nodes, ${edges.length} edges. Total: ${stats.totalNodes} nodes`)
  store.close()
}

main().catch((err) => {
  console.error('Erro:', err)
  process.exit(1)
})
