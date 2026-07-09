/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph-oriented command entries — categories:
 *   front-door, grafo-leitura, grafo-mutacao, pipeline, planejamento
 *
 * Part of the split registry. Imported and spread by command-registry.ts.
 */

import type { CommandDescriptor } from './command-registry.js'

export const REGISTRY_GRAPH: CommandDescriptor[] = [
  // ═══════════════════════════════════════════════════════════════════
  // Front door (SHAPE → BUILD → SHIP)
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'deliver',
    description: 'Pipeline ponta-a-ponta: normaliza → PRD → grafo → build TDD',
    usage: '"<pedido>"',
    category: 'front-door',
  },
  {
    name: 'import-prd',
    description: 'Importa PRD (.md/.txt/.pdf/.html/.docx) → grafo',
    usage: '<file> [--build-tree]',
    category: 'front-door',
  },
  {
    name: 'generate-prd',
    description: 'Gera PRD a partir de um prompt (via LLM)',
    usage: '"<ideia>"',
    category: 'front-door',
  },
  { name: 'build', description: 'Lifecycle completo: PRD → grafo → decompose → autopilot', category: 'front-door' },
  {
    name: 'autopilot',
    description: 'Loop autônomo: next → DoD → done|escalate',
    usage: '[--simulate|--live|--max <n>|--retries <n>|--gate-gaps|--heal-on-fail]',
    category: 'front-door',
  },
  {
    name: 'loop',
    description: 'Loop por intervalo (--every) ou goal-driven (--goal)',
    usage: '--every <dur> <cmd> | --goal <rubric> --cmd <cmd>',
    category: 'front-door',
  },
  {
    name: 'start',
    parent: 'loop',
    description: 'Inicia loop contínuo em background; schedule/agendar loop recorrente',
    usage: '--every <dur> <cmd>',
    category: 'front-door',
  },
  {
    name: 'stop',
    parent: 'loop',
    description: 'Para/cancela loop contínuo em background pelo ID',
    usage: '<id>',
    category: 'front-door',
  },
  {
    name: 'list',
    parent: 'loop',
    description: 'Lista loops ativos em background',
    category: 'front-door',
  },
  {
    name: 'status',
    parent: 'loop',
    description: 'Status de um loop específico (running, paused, stopped)',
    usage: '<id>',
    category: 'front-door',
  },
  { name: 'run', description: 'Execução one-shot: gera → aplica → testa', usage: '"<prompt>"', category: 'front-door' },
  { name: 'exec', description: 'Composição cross-platform de comandos agf', category: 'front-door' },
  {
    name: 'exec pipe',
    parent: 'exec',
    description: 'Executa um comando agf e retorna o .data JSON',
    usage: '<command> [args...]',
    category: 'front-door',
  },
  {
    name: 'exec chain',
    parent: 'exec',
    description: 'Pipeline de comandos agf separados por ;',
    usage: '"<cmd1>; <cmd2>; ..."',
    category: 'front-door',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Grafo — leitura
  // ═══════════════════════════════════════════════════════════════════
  { name: 'next', description: 'Puxa a próxima task desbloqueada (pull, WIP=1)', category: 'grafo-leitura' },
  {
    name: 'query',
    description: 'Consulta nós por tipo/status/parent/texto',
    usage: '[--type --status --parent --search --limit]',
    category: 'grafo-leitura',
  },
  {
    name: 'node show',
    parent: 'node',
    description: 'Detalhes de um nó + arestas de entrada/saída',
    usage: '<id>',
    category: 'grafo-leitura',
  },
  {
    name: 'edge ls',
    parent: 'edge',
    description: 'Lista arestas com filtros opcionais',
    usage: '[--from <id>] [--to <id>]',
    category: 'grafo-leitura',
  },
  {
    name: 'context',
    description: 'Context-pack compacto + RAG de um nó',
    usage: '<id> [--compressed]',
    category: 'grafo-leitura',
  },
  {
    name: 'brief',
    description: 'Brief de execução p/ delegar ao executor',
    usage: '<id> [--format markdown|json|claude-prompt]',
    category: 'grafo-leitura',
  },
  {
    name: 'search',
    description: 'Busca FTS5/BM25 sobre os nós do grafo (+ --hierarchical: navega o índice ToC-tree)',
    usage: '"<query>" [--limit <n>] [--hierarchical]',
    category: 'grafo-leitura',
  },
  {
    name: 'retrieve-command',
    description: 'RAG-IN: recupera o comando exato para uma intenção (fallback --help sob o limiar)',
    usage: '"<intenção>" [--threshold <n>] [--limit <n>] [--local]',
    category: 'grafo-leitura',
  },
  {
    name: 'montar-output',
    description: 'RAG-OUT: recupera scaffold adequado (preenche slots) ou gera, por objetivo',
    usage: '"<objetivo>" [--threshold <n>] [--limit <n>]',
    category: 'grafo-leitura',
  },
  { name: 'stats', description: 'Contagens e estatísticas: nodes, edges, byType, byStatus', category: 'grafo-leitura' },
  {
    name: 'kanban',
    description: 'Board Kanban com swimlanes e métricas de fluxo',
    usage: '[--swimlane]',
    category: 'grafo-leitura',
  },
  {
    name: 'insights',
    description: 'Analítica determinística: DORA, gargalos, fases, fluxo',
    category: 'grafo-leitura',
  },
  {
    name: 'insights dora',
    parent: 'insights',
    description: 'Métricas DORA (deploy freq, lead time, CFR, MTTR, trend)',
    category: 'grafo-leitura',
  },
  {
    name: 'insights bottlenecks',
    parent: 'insights',
    description: 'Detecção de gargalos (bloqueadas, sem AC, oversized)',
    category: 'grafo-leitura',
  },
  {
    name: 'insights phases',
    parent: 'insights',
    description: 'Distribuição de tasks por fase do lifecycle',
    category: 'grafo-leitura',
  },
  {
    name: 'insights wip',
    parent: 'insights',
    description: 'Contagem de WIP + alerta de violação',
    category: 'grafo-leitura',
  },
  {
    name: 'insights summary',
    parent: 'insights',
    description: 'Resumo de fluxo: métricas + WIP + gargalos',
    category: 'grafo-leitura',
  },
  { name: 'export', description: 'Serializa o grafo como JSON', usage: '[-o <file>]', category: 'grafo-leitura' },

  // ═══════════════════════════════════════════════════════════════════
  // Grafo — mutação
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'node add',
    parent: 'node',
    description: 'Cria um nó (task, epic, subtask, risk, etc.)',
    usage: '--title <t> --type <t> [--parent <id> --status <s> --priority <n> --ac <c>]',
    category: 'grafo-mutacao',
  },
  {
    name: 'node update',
    parent: 'node',
    description: 'Atualiza título, descrição, prioridade, tipo',
    usage: '<id> [--title --description --priority --type]',
    category: 'grafo-mutacao',
  },
  {
    name: 'node status',
    parent: 'node',
    description: 'Muda status com validação status_flow',
    usage: '<id> <state> [--force]',
    category: 'grafo-mutacao',
  },
  {
    name: 'node move',
    parent: 'node',
    description: 'Reparenta um nó sob novo pai',
    usage: '<id> --parent <pid>',
    category: 'grafo-mutacao',
  },
  {
    name: 'node clone',
    parent: 'node',
    description: 'Clona um nó com seus atributos',
    usage: '<id> [--parent <pid>]',
    category: 'grafo-mutacao',
  },
  { name: 'node rm', parent: 'node', description: 'Remove um nó do grafo', usage: '<id>', category: 'grafo-mutacao' },
  {
    name: 'edge add',
    parent: 'edge',
    description: 'Cria relação (depends_on, blocks, parent_of…)',
    usage: '<from> <to> [--type <t>] [--reason <r>]',
    category: 'grafo-mutacao',
  },
  { name: 'edge rm', parent: 'edge', description: 'Remove uma aresta', usage: '<id>', category: 'grafo-mutacao' },
  {
    name: 'triage',
    parent: 'risk',
    description:
      'Triagem de nós de risco abertos: drenar/promover risco em task, aceitar, fechar risco; drain risk promote accept close',
    usage: '[--promote <id>] [--accept <id>] [--reason <txt>] [--close <id>] [--commit]',
    category: 'grafo-mutacao',
  },
  {
    name: 'triage --promote',
    parent: 'risk',
    description: 'Promove risco para task de mitigação (promote risk to mitigation task)',
    usage: '--promote <riskId>',
    category: 'grafo-mutacao',
  },
  {
    name: 'triage --accept',
    parent: 'risk',
    description: 'Aceita um risco com justificativa (accept risk with documented reason)',
    usage: '--accept <riskId> --reason <txt>',
    category: 'grafo-mutacao',
  },
  {
    name: 'triage --close',
    parent: 'risk',
    description: 'Arquiva/fecha risco inválido ou resolvido (close archive resolved risk)',
    usage: '--close <riskId>',
    category: 'grafo-mutacao',
  },
  {
    name: 'import-graph',
    description: 'Funde um grafo JSON exportado no projeto',
    usage: '<file> [--dry-run]',
    category: 'grafo-mutacao',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Pipeline de task (2 calls)
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'start',
    description: 'Inicia próxima task: wake-up + next + context + marca in_progress',
    category: 'pipeline',
  },
  { name: 'check', description: 'Definition of Done (12 checks) + aderência TDD', usage: '<id>', category: 'pipeline' },
  {
    name: 'done',
    description: 'Finaliza: DoD + run tests + memória + done + sugere próxima',
    usage: '<id> [--skip-test]',
    category: 'pipeline',
  },
  {
    name: 'pipeline',
    description: 'Compound commands: múltiplas operações num único ciclo store',
    category: 'pipeline',
  },
  {
    name: 'pipeline next-context',
    parent: 'pipeline',
    description: 'Find next task + load context (1 store open)',
    usage: '[--full] [-d dir]',
    category: 'pipeline',
  },
  {
    name: 'pipeline next-start',
    parent: 'pipeline',
    description: 'Find next + context + mark in_progress (1 store open)',
    usage: '[--full] [-d dir]',
    category: 'pipeline',
  },
  {
    name: 'pipeline next-context-start',
    parent: 'pipeline',
    description: 'Alias for next-start',
    usage: '[--full] [-d dir]',
    category: 'pipeline',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Decomposição & planejamento
  // ═══════════════════════════════════════════════════════════════════
  { name: 'decompose', description: 'Detecta tasks grandes e sugere subtasks atômicas', category: 'planejamento' },
  { name: 'phase', description: 'Taxonomia SHAPE→BUILD→SHIP + fase atual', category: 'planejamento' },
  {
    name: 'gate',
    description: 'Gates de prontidão por fase do lifecycle',
    usage: '<design|review|handoff|deploy|listening|all>',
    category: 'planejamento',
  },
  {
    name: 'template list',
    parent: 'template',
    description: 'Lista templates de decomposição disponíveis',
    category: 'planejamento',
  },
  {
    name: 'template apply',
    parent: 'template',
    description: 'Aplica um template a um nó do grafo',
    usage: '<name>',
    category: 'planejamento',
  },
  {
    name: 'scaffold',
    description: 'Scaffold/boilerplate determinístico (acoplador)',
    usage: '<nome> [--type class|fn|comp|iface|type]',
    category: 'planejamento',
  },
]
