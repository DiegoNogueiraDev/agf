/*!
 * command-registry — single source of truth for agf CLI command metadata.
 *
 * WHY: usage-cmd.ts had a hardcoded list of command names that drifted from
 * index.ts. This module is the authoritative name+description list; index.ts
 * and usage-cmd.ts both import from here so drift is impossible.
 *
 * Loaders live in index.ts (they import Commander + command files).
 * This module is pure data — no I/O, no Commander, no dynamic imports.
 */

export interface CommandEntry {
  /** agf sub-command name (e.g. 'next', 'done', 'import-prd'). */
  name: string
  /** One-line description shown in help and usage report. */
  description: string
}

export const COMMAND_REGISTRY: CommandEntry[] = [
  { name: 'import-prd', description: 'Import a PRD file into the graph' },
  { name: 'compress', description: 'Compressor de saída de ferramenta: filtros, discover, teste' },
  { name: 'economy', description: 'Toggle/list opt-in bio/math token-economy levers' },
  { name: 'exec', description: 'Executa comandos agf em composição (pipe, chain)' },
  { name: 'eval', description: 'Suíte de cenários reais → scorecard (resolve% × custo-por-sucesso)' },
  { name: 'scan', description: 'Agrega findings de qualidade (harness, LSP, lint) num envelope unificado' },
  {
    name: 'scan-repos',
    description: 'Explora repos vizinhos: fingerprint + diff de capacidades vs agf → insights ranqueados',
  },
  {
    name: 'wire-dormant',
    description: 'Lista capacidades dormentes e injeta WIRE-tasks no backlog (dry-run por default)',
  },
  { name: 'welcome', description: 'Zero-token orientation: stats + next task + lifecycle skills' },
  { name: 'help', description: 'Friendly command index + first steps' },
  {
    name: 'reference',
    description: 'Print the compiled agf reference guide (tools, skills, phases, gates)',
  },
  { name: 'status', description: 'Unified panel: provider/model/cache + tokens/$ + savings' },
  { name: 'phase', description: 'Manage lifecycle phase detection' },
  { name: 'next', description: 'Suggest the next task to work on' },
  { name: 'hooks', description: 'Inspect the 28-point hook taxonomy (list/test/discover)' },
  { name: 'decompose', description: 'Decompose tasks into subtasks' },
  { name: 'check', description: 'Run DoD validation checks' },
  { name: 'code', description: 'Code intelligence: index, search, navigate, impact analysis, LSP diagnostics' },
  { name: 'autopilot', description: 'Run autonomous sprint execution' },
  { name: 'run', description: 'One-shot ad-hoc execution' },
  { name: 'model', description: 'Manage tier-router model config' },
  { name: 'stats', description: 'Show graph statistics' },
  { name: 'metrics', description: 'Show token and cost metrics' },
  { name: 'cache', description: 'Prompt-cache management and statistics (cache stats)' },
  { name: 'insights', description: 'Deterministic graph analytics (DORA, bottlenecks, phases)' },
  { name: 'gate', description: 'Run phase-readiness gates (design/review/handoff/deploy/listening)' },
  { name: 'gaps', description: 'Detect SHAPE completeness gaps + emit driver-agnostic enrichment requests (zero MCP)' },
  {
    name: 'brief',
    // node_22c942f2e2a3 — dizer "delegation brief … task" em palavras planas: o
    // tool-routing pontua por cobertura de conceitos e "ExecutorBrief"/"node"
    // não cobrem "brief"/"task" — o intent do exec safe resolvia generate-prd.
    description: 'Generate the delegation brief (ExecutorBrief spec) for a task node — markdown | json | claude-prompt',
  },
  {
    name: 'preflight',
    description: 'Golden-rule guard: git-history + graph dedupe before implementing (zero MCP, ~0 token)',
  },
  { name: 'retrieve', description: 'Retrieve a cached CCR original by hash (optionally BM25-ranked by --query)' },
  { name: 'kanban', description: 'Render the Kanban board (status, WIP, flow metrics)' },
  { name: 'adr', description: 'Architecture Decision Records (create, list)' },
  { name: 'learning', description: 'Persisted learning: per-agent performance, routing, export' },
  { name: 'heal', description: 'Self-healing do grafo (MAPE-K) com persistência' },
  { name: 'knowledge-lint', description: 'Lint read-only do knowledge store (findings sem deleção)' },
  { name: 'immune', description: 'Sistema Imune: detecção e recuperação Danger Theory em código-fonte' },
  { name: 'scaffold', description: 'Geração determinística de scaffold/boilerplate (acoplador determinístico)' },
  { name: 'login', description: 'Authenticate with GitHub Copilot' },
  { name: 'logout', description: 'Clear authentication' },
  { name: 'init', description: 'Initialize a project graph' },
  { name: 'dashboard', description: 'Start the agf progress dashboard server' },
  { name: 'marketplace', description: 'Manage the agf skill/plugin marketplace' },
  { name: 'daemon', description: 'Manage the local daemon service' },
  { name: 'doctor', description: 'Run environment diagnostics' },
  {
    name: 'docs',
    description: 'Inspect the local docs cache (list/search/sync) or generate living graph docs (`docs generate`)',
  },
  { name: 'gc', description: 'Run garbage collection' },
  { name: 'colony-health', description: 'Show colony health status and snapshot history (--history)' },
  { name: 'agent', description: 'Agent role management: create (scaffold TOML) | list (built-in + project)' },
  { name: 'caste', description: 'Colony caste taxonomy: list|show (model_tier, max_complexity, task_types)' },
  { name: 'skill', description: 'Manage lifecycle skills' },
  { name: 'profile', description: 'Manage config profiles' },
  { name: 'config', description: 'Get, set, or list project config settings' },
  { name: 'principles', description: 'Manage governing principles' },
  { name: 'generate-prd', description: 'Generate a PRD from an idea' },
  {
    name: 'genesis',
    description:
      'Criar um projeto do zero: ideia → grafo → primeiro brief em 1 round-trip (init → generate_prd → import_prd → decompose → gaps → brief)',
  },
  { name: 'build', description: 'Full lifecycle cycle with gates' },
  { name: 'deliver', description: 'Request → PRD → graph → TDD build (autonomous, one command)' },
  { name: 'quality', description: 'Run quality gate 95/95' },
  { name: 'ac', description: 'AC quality tools (harden weak ACs to GWT)' },
  { name: 'tdd-score', description: 'Compute TDD quality score (0–100) for a task' },
  {
    name: 'certainty',
    description: 'Delivery Certainty — verdict "is it REALLY done?" with the means (pillars) explicit',
  },
  { name: 'ui', description: 'Start minimal web progress UI' },
  { name: 'provider', description: 'Manage LLM providers' },
  { name: 'claims', description: 'List active agent lease claims on graph tasks (read-only visibility)' },
  {
    name: 'ant',
    description:
      'Worktree-por-formiga: spawn|list|rm cria worktree isolado por agente, todas as formigas no MESMO grafo central (AGF_GRAPH_ROOT)',
  },
  { name: 'swarm', description: 'Multi-agent fabric over the graph: session/claim/mailbox/consensus (opt-in)' },
  { name: 'provenance', description: 'Epistemic-tier ladder: promote/downgrade/hash (honesty gates, local)' },
  { name: 'harness', description: 'Run harnessability scan' },
  { name: 'lsp', description: 'Language server bridge: status of configured servers' },
  { name: 'session', description: 'Inspect the unified session/runtime read-model (show, grants, events)' },
  { name: 'constitution', description: 'Manage project constitution' },
  { name: 'plugin', description: 'Manage plugin extensions' },
  { name: 'preset', description: 'Manage workflow presets' },
  { name: 'spec', description: 'Generate and validate specs' },
  { name: 'spec-sync', description: 'Living specs: register/list/status/link (versioned)' },
  { name: 'template', description: 'Reusable decomposition templates (list, apply)' },
  { name: 'node', description: 'CRUD e mutações de nós (add/show/update/status/move/clone/rm) — zero MCP' },
  { name: 'edge', description: 'CRUD de arestas (add/rm/ls) — zero MCP' },
  { name: 'query', description: 'Consulta nós por tipo/status/parent/texto (query_graph/list)' },
  { name: 'context', description: 'Emite o context-pack (compact) de um nó' },
  { name: 'memory', description: 'Gerencia memórias do projeto (write/read/list/rm)' },
  { name: 'snapshot', description: 'Cria/lista/restaura snapshots do grafo' },
  { name: 'export', description: 'Serializa o grafo como JSON' },
  { name: 'import-graph', description: 'Funde um grafo JSON exportado no projeto' },
  { name: 'search', description: 'Busca FTS5/BM25 sobre os nós do grafo' },
  { name: 'retrieve-command', description: 'RAG-IN: recupera o comando exato para uma intenção (fallback --help)' },
  { name: 'montar-output', description: 'RAG-OUT: recupera scaffold adequado (preenche slots) ou gera, por objetivo' },
  { name: 'calibrate', description: 'Calibra o limiar do portão RAG por score×saved (lê o lever ledger)' },
  { name: 'learn-eval', description: 'Relatório de precisão do aprendizado ACO/bandit (accuracy, regret, Brier, ECE)' },
  { name: 'migrate-ac', description: 'Colapsa AC-nodes legados no ac[] do pai e os arquiva (dry-run por padrão)' },
  { name: 'forecast', description: 'Métricas DORA do grafo' },
  { name: 'start', description: 'Start next task: wake-up + next + context + mark in_progress' },
  { name: 'dream', description: 'REM-inspired knowledge consolidation cycles (start/status/history/cancel)' },
  { name: 'done', description: 'Complete task: DoD check + store memory + mark done + suggest next' },
  { name: 'commit-scope', description: 'Commita exatamente os arquivos declarados do node (pathspec)' },
  { name: 'submit', description: 'Modo delegado: ingere resultado do executor (brief) → blast → DoD → done' },
  { name: 'savings', description: 'Tabela cumulativa de economia de tokens' },
  { name: 'loop', description: 'Re-run an agf command on an interval, or drive a goal-rubric loop until it passes' },
  { name: 'test', description: 'Run vitest tests, graph-aware (default: affected tests for current task)' },
  { name: 'lint', description: 'Run eslint on affected files (graph-aware) or entire project' },
  { name: 'lint-files', description: 'Check source files for 800-line compliance; exit 1 if violations found' },
  {
    name: 'scan-silent-failures',
    description: "Scan a dir for masking fallbacks (|| [], || '', empty catch, @ts-expect-error)",
  },
  { name: 'usage', description: 'Command usage analytics: track, report, auto-generate wrappers' },
  { name: 'pipeline', description: 'Compound commands: multiple operations in a single store cycle (faster)' },
  { name: 'risk', description: 'Risk management: triage open risks (promote/accept/close)' },
]

/** Return all registered command names in order. */
export function getRegisteredCommandNames(): string[] {
  return COMMAND_REGISTRY.map((e) => e.name)
}
