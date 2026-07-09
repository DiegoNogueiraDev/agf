/**
 * Script para criar nodes no grafo: Epic "Integration Gaps — v0.14"
 * Cobre os gaps de integracao encontrados no parity scan:
 * - Stub integrations (mcp-deps-installer, tool-status, mcp-servers-config)
 * - harness:scan script missing
 * - test:blast drift + smoke tests
 * - README stale
 * - Providers nao wireados (gemini, bedrock, azure, deepseek, glm, kimi, groq)
 * - Prompt caching wire-up
 * - docs/strategy/ missing
 * - sync-openrouter-prices script
 */
import { SqliteStore } from '../src/core/store/sqlite-store.js'

async function main() {
  const store = SqliteStore.open(process.cwd())

  if (!store.getProject()) {
    store.initProject('agent-graph-flow')
  }

  const now = new Date().toISOString()

  // ── Parent Epic ────────────────────────────────────
  const parentEpic = {
    id: 'epic-v014-integration-gaps',
    type: 'epic' as const,
    title: 'v0.14 — Integration Gaps: tornar o projeto totalmente usavel',
    description:
      'Fechar todos os gaps de integracao que impedem o uso total do projeto: stubs que retornam false, scripts ausentes, providers nao wireados, prompt caching, docs ausentes. Zero regressao.',
    status: 'backlog' as const,
    priority: 1 as const,
    xpSize: 'L' as const,
    estimateMinutes: 600,
    tags: ['integration', 'gaps', 'v0.14', 'polish'],
    acceptanceCriteria: [
      'Todas as 3 integracoes stub retornam valores reais (mcp-deps-installer, tool-status, mcp-servers-config)',
      'harness:scan script adicionado ao package.json e funcional',
      'test:blast sem drift (alinhado com .claude/rules/tests.md)',
      'src/tests/smoke/ criado com testes smoke',
      'README atualizado (M0 -> M0-M5 completos)',
      '7 providers wireados no gateway-factory.ts (gemini, bedrock, azure, deepseek, glm, kimi, groq)',
      'Prompt caching wireado atraves do adapter path',
      'docs/strategy/ criado com token-economy-redesign.md',
      'sync-openrouter-prices script implementado',
      'Zero regressoes — full test suite >= 352 verde',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
    metadata: {
      methodology: 'TDD',
      preset: 'strict-tdd',
      wip: 1,
      totalTasks: 9,
    },
  }

  // ── Task 1: Fix stub integrations ──────────────────
  const t1 = {
    id: 'v014-t1-stub-integrations',
    type: 'task' as const,
    title: 'v0.14.T1 — Fix stub integrations (mcp-deps-installer, tool-status, mcp-servers-config)',
    description:
      'As 3 integracoes em src/core/integrations/ retornam valores fixos (false, [], {}). Substituir por implementacoes reais que detectam e conectam a backends.',
    status: 'backlog' as const,
    priority: 1 as const,
    xpSize: 'M' as const,
    estimateMinutes: 120,
    tags: ['integration', 'stubs', 'fix'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'mcp-deps-installer.ts: isCommandAvailable() detecta comandos reais, installAllMcpDeps() instala dependencias detectadas',
      'tool-status.ts: getIntegrationsStatus() retorna status real do sistema (codeGraph, memories, playwright)',
      'mcp-servers-config.ts: buildMcpServersConfig() gera config reais baseado nas dependencias instaladas',
      'Testes unitarios para cada integracao corrigida',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 2: harness:scan script ────────────────────
  const t2 = {
    id: 'v014-t2-harness-scan-script',
    type: 'task' as const,
    title: 'v0.14.T2 — Add harness:scan script to package.json',
    description:
      'O script npm run harness:scan e referenciado em 5+ arquivos mas nao existe no package.json. Adicionar com ponto de entrada no CLI.',
    status: 'backlog' as const,
    priority: 1 as const,
    xpSize: 'S' as const,
    estimateMinutes: 60,
    tags: ['scripts', 'harness', 'package.json'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'npm run harness:scan adicionado ao package.json',
      'Comando executa harness-scan-runner.ts e produz output human-readable',
      'CLI command /harness-scan ou mg harness-scan funcional',
      'Script retorna exit code 0 em sucesso, !=0 em falha',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 3: test:blast drift + smoke tests ─────────
  const t3 = {
    id: 'v014-t3-test-infra',
    type: 'task' as const,
    title: 'v0.14.T3 — Fix test:blast drift + create smoke tests directory',
    description:
      'Alinhar test:blast com .claude/rules/tests.md (adicionar --project=node). Criar src/tests/smoke/ com smoke tests basicos.',
    status: 'backlog' as const,
    priority: 1 as const,
    xpSize: 'S' as const,
    estimateMinutes: 60,
    tags: ['tests', 'infra', 'smoke'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'test:blast alinhado com spec (--project=node)',
      'src/tests/smoke/ criado com smoke tests',
      'npm run test:smoke executa smoke tests',
      'Smoke tests cobrem health check do sistema',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 4: Fix stale README ───────────────────────
  const t4 = {
    id: 'v014-t4-readme-update',
    type: 'task' as const,
    title: 'v0.14.T4 — Update README from M0 to M0-M5 complete',
    description:
      'README.md mostra M0 bootstrap, mas CLAUDE.md confirma M0-M5 completos. Atualizar README para refletir estado real.',
    status: 'backlog' as const,
    priority: 2 as const,
    xpSize: 'XS' as const,
    estimateMinutes: 30,
    tags: ['docs', 'readme'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'README.md reflete M0-M5 completos (nao apenas M0 bootstrap)',
      'Roadmap section aponta para proximo ciclo (v0.14)',
      'Referencias a docs/strategy/ mantidas ou removidas corretamente',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 5: Wire 7 providers ───────────────────────
  const t5 = {
    id: 'v014-t5-providers-wire',
    type: 'task' as const,
    title: 'v0.14.T5 — Wire 7 providers in gateway factory (gemini/bedrock/azure/deepseek/glm/kimi/groq)',
    description:
      '7 providers existem no model registry mas nao estao wireados no gateway-factory.ts. Adicionar model-spec seeds e adapters para cada um.',
    status: 'backlog' as const,
    priority: 2 as const,
    xpSize: 'M' as const,
    estimateMinutes: 120,
    tags: ['providers', 'llm', 'gateway'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'gemini, bedrock, azure, deepseek, glm, kimi, groq wireados no gateway-factory.ts',
      'Cada provider tem model-spec seed no registry',
      'Cada provider tem adapter (ou reusa openai-compatible quando aplicavel)',
      'resolveModelAdapter() consegue resolver cada provider',
      'Testes de unidade para cada adapter adicionado',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 6: Wire prompt caching ────────────────────
  const t6 = {
    id: 'v014-t6-prompt-caching',
    type: 'task' as const,
    title: 'v0.14.T6 — Wire prompt caching through adapter path',
    description:
      'Infra de prompt caching existe (anthropic-cache-control.ts, colunas no ledger) mas esta desconectada. Conectar atraves do adapter path vigente.',
    status: 'backlog' as const,
    priority: 2 as const,
    xpSize: 'S' as const,
    estimateMinutes: 90,
    tags: ['llm', 'cache', 'prompt', 'token-economy'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'Prompt caching funcional atraves do adapter path existente',
      'cache_control enviado em chamadas LLM quando provider suporta',
      'cache_usage registrado no llm_call_ledger',
      'Testes validam economia de tokens com cache ativo',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 7: Create docs/strategy/ ──────────────────
  const t7 = {
    id: 'v014-t7-docs-strategy',
    type: 'task' as const,
    title: 'v0.14.T7 — Create docs/strategy/ with token-economy-redesign.md',
    description:
      'Criar diretorio docs/strategy/ e documento token-economy-redesign.md descrevendo arquitetura de economia de tokens do projeto.',
    status: 'backlog' as const,
    priority: 3 as const,
    xpSize: 'S' as const,
    estimateMinutes: 60,
    tags: ['docs', 'strategy', 'token-economy'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'docs/strategy/ criado',
      'token-economy-redesign.md documenta arquitetura de economia de tokens',
      'Documento referencia componentes existentes (tier-router, prompt-cache, context-compaction)',
      'README e CLAUDE.md apontam para doc existente',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 8: sync-openrouter-prices script ──────────
  const t8 = {
    id: 'v014-t8-sync-prices',
    type: 'task' as const,
    title: 'v0.14.T8 — Implement sync-openrouter-prices script',
    description:
      'TODO em src/core/llm/registry.ts referencia sync-openrouter-prices script. Implementar script que busca precos atualizados da OpenRouter API e atualiza MODEL_PRICING.',
    status: 'backlog' as const,
    priority: 3 as const,
    xpSize: 'S' as const,
    estimateMinutes: 60,
    tags: ['llm', 'pricing', 'scripts'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'Script sync-openrouter-prices.ts funcional',
      'Busca precos da OpenRouter API (ou fallback local)',
      'Atualiza MODEL_PRICING no registry.ts',
      'npm run sync:prices adicionado ao package.json',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Task 9: Full regression test ───────────────────
  const t9 = {
    id: 'v014-t9-regression-test',
    type: 'task' as const,
    title: 'v0.14.T9 — Full regression test suite (>=352 verde)',
    description:
      'Rodar test suite completa, garantir zero regressoes, verificar coverage thresholds. Ultimo gate antes do release v0.14.',
    status: 'backlog' as const,
    priority: 1 as const,
    xpSize: 'XS' as const,
    estimateMinutes: 30,
    tags: ['tests', 'regression', 'release'],
    parentId: 'epic-v014-integration-gaps',
    acceptanceCriteria: [
      'Full test suite >= 352 tests passando',
      'Coverage nao regrediu em relacao ao baseline',
      'Nenhum comando CLI quebrado',
      'npm run test:smoke funcional',
    ],
    createdAt: now,
    updatedAt: now,
    sprint: 'Sprint-v014',
  }

  // ── Risk & Constraint nodes ───────────────────────
  const riskNodes = [
    {
      id: 'risk-v014-regression',
      type: 'risk' as const,
      status: 'backlog' as const,
      priority: 1,
      title: 'Risco: Regressao ao conectar stub integrations',
      description:
        'Ao substituir stubs por implementacoes reais, comandos que dependem deles podem quebrar. Mitigacao: TDD + testes de regressao.',
      createdAt: now,
      updatedAt: now,
      metadata: { severity: 'medium', mitigation: 'TDD + full test suite antes de cada merge' },
      parentId: 'epic-v014-integration-gaps',
    },
    {
      id: 'risk-v014-provider-break',
      type: 'risk' as const,
      status: 'backlog' as const,
      priority: 2,
      title: 'Risco: Wirear providers pode quebrar resolveModelAdapter',
      description:
        'Adicionar 7 providers ao gateway factory pode introduzir conflitos de resolucao. Mitigacao: testes de unidade para cada adapter.',
      createdAt: now,
      updatedAt: now,
      metadata: { severity: 'medium', mitigation: 'testes de unidade por adapter' },
      parentId: 'epic-v014-integration-gaps',
    },
  ]

  const constraintNodes = [
    {
      id: 'constraint-v014-no-regression',
      type: 'constraint' as const,
      status: 'backlog' as const,
      priority: 1,
      title: 'Constraint: Zero regressao — full test suite >= 352 verde',
      description: 'Nenhum dos 352 testes existentes pode quebrar. TDD obrigatorio em todas as tasks.',
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-v014-integration-gaps',
    },
    {
      id: 'constraint-v014-tdd',
      type: 'constraint' as const,
      status: 'backlog' as const,
      priority: 1,
      title: 'Constraint: TDD obrigatorio em todas as tasks',
      description: 'Toda task segue Red->Green->Refactor. Teste antes do codigo.',
      createdAt: now,
      updatedAt: now,
      parentId: 'epic-v014-integration-gaps',
    },
  ]

  // ── Build all nodes ──────────────────────────────
  const allNodes = [parentEpic, t1, t2, t3, t4, t5, t6, t7, t8, t9, ...riskNodes, ...constraintNodes]

  // ── Build edges ──────────────────────────────────
  const edges: Array<Record<string, unknown>> = []

  // Tasks → Parent Epic
  for (const t of [t1, t2, t3, t4, t5, t6, t7, t8, t9]) {
    edges.push({
      id: `e-${t.id}-parent`,
      from: t.id,
      to: 'epic-v014-integration-gaps',
      relationType: 'child_of',
      createdAt: now,
    })
  }

  // Dependencies: T9 (regression test) depends on all other tasks
  for (const t of [t1, t2, t3, t4, t5, t6, t7, t8]) {
    edges.push({
      id: `e-dep-t9-after-${t.id}`,
      from: 'v014-t9-regression-test',
      to: t.id,
      relationType: 'depends_on',
      createdAt: now,
    })
  }

  // T4 (README) depends on T7 (docs/strategy) since README references strategy dir
  edges.push({
    id: 'e-dep-t4-after-t7',
    from: 'v014-t4-readme-update',
    to: 'v014-t7-docs-strategy',
    relationType: 'depends_on',
    createdAt: now,
  })

  // Risk & Constraint → Parent Epic
  for (const r of riskNodes) {
    edges.push({
      id: `e-${r.id}-parent`,
      from: r.id,
      to: 'epic-v014-integration-gaps',
      relationType: 'related_to',
      createdAt: now,
    })
  }
  for (const c of constraintNodes) {
    edges.push({
      id: `e-${c.id}-parent`,
      from: c.id,
      to: 'epic-v014-integration-gaps',
      relationType: 'related_to',
      createdAt: now,
    })
  }

  // ── Insert ───────────────────────────────────────
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
  console.log(`  Epic: 1 parent`)
  console.log(`  Tasks: 9`)
  console.log(`  Risks: ${riskNodes.length}, Constraints: ${constraintNodes.length}`)
  console.log(
    `  Total no grafo: ${stats.totalNodes} nodes, ${Object.entries(stats.byStatus)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  )

  store.close()
}

main().catch((err) => {
  console.error('Erro:', err)
  process.exit(1)
})
