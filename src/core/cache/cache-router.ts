import type { QueryCategory, CacheRouterConfig } from './cache-types.js'

const READ_TOOLS = new Set([
  'stats',
  'list',
  'show',
  'metrics',
  'export',
  'snapshot',
  'kanban',
  'forecast',
  'graph_health',
  'help',
  'next',
  'list_memories',
  'read_memory',
])

const MUTATE_TOOLS = new Set([
  'addNode',
  'deleteNode',
  'updateNode',
  'setStatus',
  'addEdge',
  'deleteEdge',
  'import_prd',
  'update_status',
])

const KNOWLEDGE_TOOLS = new Set(['search', 'context', 'rag', 'query_graph', 'knowledge'])

const CODE_INTEL_TOOLS = new Set([
  'code_intelligence',
  'definition',
  'references',
  'hover',
  'diagnostics',
  'document_symbols',
])

const SESSION_TOOLS = new Set([
  'findNext',
  'getPhase',
  'getModel',
  'getGraphNodes',
  'listSkills',
  'getSkill',
  'principles',
  'providers',
  'quality',
])

const DEFAULT_TTLS: CacheRouterConfig = {
  graph_read: 30_000,
  graph_mutate: 0,
  knowledge: 60_000,
  code_intel: 120_000,
  session: 10_000,
}

export class CacheRouter {
  private ttls: CacheRouterConfig

  constructor(ttls?: Partial<CacheRouterConfig>) {
    this.ttls = { ...DEFAULT_TTLS, ...ttls }
  }

  classify(toolName: string): QueryCategory {
    if (READ_TOOLS.has(toolName)) return 'graph_read'
    if (MUTATE_TOOLS.has(toolName)) return 'graph_mutate'
    if (KNOWLEDGE_TOOLS.has(toolName)) return 'knowledge'
    if (CODE_INTEL_TOOLS.has(toolName)) return 'code_intel'
    if (SESSION_TOOLS.has(toolName)) return 'session'
    return 'graph_read'
  }

  isCacheable(toolName: string): boolean {
    return this.classify(toolName) !== 'graph_mutate'
  }

  getTTL(category: QueryCategory): number {
    return this.ttls[category]
  }

  getConfig(): CacheRouterConfig {
    return { ...this.ttls }
  }
}
