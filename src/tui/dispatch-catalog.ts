/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Slash command catalog — the COMMANDS array and SlashCommand type.
 * WHY here: catalog data (~370 entries) separated from parsing logic and port
 * interfaces to keep each concern under 800 lines.
 * Composing: imported by dispatch.ts barrel and dispatch-parsing.ts.
 */

export interface SlashCommand {
  name: string
  aliases?: string[]
  usage: string
  desc: string
  /** Short argument hint shown next to the suggestion (e.g. "<prompt>", "<nodeId>"). */
  argHint?: string
  /** Origem do comando para badge na paleta. Default tratado como "cmd". */
  source?: 'cmd' | 'skill'
}

export const COMMANDS: SlashCommand[] = [
  { name: 'next', aliases: ['n'], usage: '/next', desc: 'Próxima task desbloqueada' },
  { name: 'stats', aliases: ['s'], usage: '/stats', desc: 'Contagens do grafo' },
  { name: 'metrics', aliases: ['m'], usage: '/metrics', desc: 'Tokens e custo da sessão' },
  { name: 'status', usage: '/status', desc: 'Painel: provider/modelo/cache + tokens/$ + economia' },
  { name: 'run', usage: '/run <prompt>', argHint: '<prompt>', desc: 'Implementa um prompt (one-shot)' },
  { name: 'autopilot', usage: '/autopilot [n]', desc: 'Roda o loop autônomo' },
  {
    name: 'loop',
    usage: '/loop <payload> <dur> | /loop stop [id|all]',
    desc: 'Agenda loop em background (agf loop start/stop)',
  },
  { name: 'start', usage: '/start', desc: 'agf start — wake-up + next + context + mark in_progress (WIP=1)' },
  { name: 'check', usage: '/check <nodeId>', argHint: '<nodeId>', desc: 'DoD check numa task' },
  {
    name: 'context',
    usage: '/context <nodeId>',
    argHint: '<nodeId>',
    desc: 'Context-pack compacto + RAG para uma task',
  },
  { name: 'decompose', usage: '/decompose', desc: 'Detecta tasks grandes' },
  { name: 'phase', usage: '/phase', desc: 'Fase atual do projeto' },
  { name: 'model', usage: '/model', desc: 'Modelo ativo (tier-router)' },
  { name: 'import-prd', usage: '/import-prd <file>', argHint: '<file>', desc: 'Importa PRD → grafo' },
  { name: 'doctor', usage: '/doctor', desc: 'Health check do ambiente' },
  {
    name: 'plugins',
    usage: '/plugins [list|enable|disable|info] [name]',
    argHint: '[sub] [name]',
    desc: 'Gerencia plugins registrados',
  },
  { name: 'config', usage: '/config', desc: 'Exibe config em camadas (default→project→local→env)' },
  { name: 'skills', usage: '/skills [fase]', desc: 'Lista skills disponíveis' },
  { name: 'skill', usage: '/skill <nome>', desc: 'Exibe instruções da skill' },
  { name: 'deliver', usage: '/deliver <pedido>', desc: 'Pedido → PRD → grafo → build (autônomo, econômico)' },
  { name: 'build', usage: '/build [max]', desc: 'Orquestra a entrega end-to-end' },
  { name: 'generate-prd', usage: '/generate-prd <descrição>', desc: 'Gera um PRD e importa' },
  { name: 'quality', usage: '/quality', desc: 'Gate de qualidade 95/95 (testes+logs)' },
  { name: 'principles', usage: '/principles', desc: 'O credo de engenharia (λ_flow)' },
  {
    name: 'provider',
    usage: '/provider [list|current|use <id>|set-url <url>]',
    desc: 'Provider de modelo: lista, mostra o ativo, troca ou ajusta o endpoint',
  },
  { name: 'kanban', usage: '/kanban [epic:<id>|sprint:<id>]', desc: 'Kanban board com 5 colunas' },
  {
    name: 'insights',
    usage: '/insights [dora|bottlenecks|phases]',
    desc: 'Analítica do grafo (DORA, gargalos, fases)',
  },
  { name: 'gate', usage: '/gate <design|review|handoff|deploy|listening|all>', desc: 'Gates de prontidão de fase' },
  { name: 'learning', usage: '/learning [stats]', desc: 'Aprendizado persistido por agente' },
  { name: 'heal', usage: '/heal [apply]', desc: 'Self-healing do grafo (MAPE-K)' },
  {
    name: 'gaps',
    aliases: ['g'],
    usage: '/gaps [--severity required]',
    desc: 'Detecta lacunas de completude no grafo (required blockers)',
  },
  { name: 'savings', usage: '/savings [--reset]', desc: 'Economia cumulativa de tokens por task (ledger real)' },
  {
    name: 'theme',
    usage: '/theme [list|use <name>|show]',
    desc: 'Manage TUI color theme: list available, switch active, or show current',
  },
  { name: 'preflight', usage: '/preflight <topic>', desc: 'Verifica branch/WIP/duplicatas antes de implementar' },
  { name: 'brief', usage: '/brief <id>', desc: 'Gera spec de delegação para o executor (intenção, AC, contrato)' },
  { name: 'submit', usage: '/submit <id>', desc: 'Valida resultado do executor → blast → DoD → done' },
  { name: 'diff', usage: '/diff', desc: 'Exibe/esconde o painel de edicoes' },
  { name: 'preset', usage: '/preset [apply|list] [nome]', desc: 'Gerencia presets de workflow' },
  {
    name: 'collaborate',
    aliases: ['col'],
    usage: '/collaborate [plan|execute|pair]',
    desc: 'Alterna modo de colaboracao',
  },
  {
    name: 'scaffold',
    usage: '/scaffold <nome> [--type class|fn|comp|iface|type] [--dir <path>]',
    desc: 'Gera esqueleto de codigo',
  },
  { name: 'constitution', usage: '/constitution [list|check <nodeId>]', desc: 'Principios do projeto' },
  {
    name: 'feedback',
    usage: '/feedback <bug|melhoria|feature> <mensagem>',
    desc: 'Enviar feedback (bug/melhoria/feature)',
  },
  { name: 'wizard', usage: '/wizard', desc: 'Reinicia o wizard de onboarding' },
  {
    name: 'surface',
    aliases: ['fmt'],
    usage: '/surface <intent>',
    desc: 'Roteia output pelo policy matrix deterministicamente',
  },
  {
    name: 'browser',
    aliases: ['br'],
    usage: '/browser <subcomando> [args]',
    desc: 'Browser harness: screenshot, info, goto, click, type, eval, tabs, etc.',
    source: 'skill',
  },
  {
    name: 'workbench',
    aliases: ['wb'],
    usage: '/workbench [list|save <name> <file>|show <name>]',
    desc: 'Gerencia helpers reutilizaveis do agente',
  },
  { name: 'compact', aliases: ['cpt'], usage: '/compact', desc: 'Compacta contexto com template estruturado' },
  { name: 'deps', usage: '/deps [skill]', desc: 'Verifica dependencias de skills' },
  { name: 'audit', usage: '/audit [nodeId] [tool] [status]', desc: 'Query ao log de auditoria estruturado' },
  { name: 'repl', usage: '/repl', desc: 'Entra no modo REPL interativo' },
  {
    name: 'cache-stats',
    aliases: ['cs'],
    usage: '/cache-stats',
    desc: 'Dashboard de eficiencia de cache (hit rate, tokens, $)',
  },

  { name: 'help', usage: '/help', desc: 'Lista os comandos' },
  { name: 'quit', usage: '/quit', desc: 'Sair da TUI' },

  // ── Skills como built-in commands (source:'skill') ────
  { name: 'graph-analyze', usage: '/graph-analyze', desc: 'ANALYZE — PRD, requisitos, DoR', source: 'skill' },
  { name: 'graph-prd', usage: '/graph-prd', desc: 'Pre-lifecycle — transforma ideia vaga em PRD', source: 'skill' },
  { name: 'graph-design', usage: '/graph-design', desc: 'DESIGN — C4, ADRs, fitness functions', source: 'skill' },
  { name: 'graph-plan', usage: '/graph-plan', desc: 'PLAN — decomposicao, sprint, estimativas', source: 'skill' },
  { name: 'graph-implement', usage: '/graph-implement', desc: 'IMPLEMENT — TDD Red-Green-Refactor', source: 'skill' },
  { name: 'graph-bugs', usage: '/graph-bugs', desc: 'Bug discovery + structured fix via 5-Whys', source: 'skill' },
  { name: 'graph-validate', usage: '/graph-validate', desc: 'VALIDATE — E2E tests, AC quality, DORA', source: 'skill' },
  {
    name: 'graph-platform',
    usage: '/graph-platform',
    desc: 'Platform audit — web vitals, a11y, harness',
    source: 'skill',
  },
  {
    name: 'graph-review',
    usage: '/graph-review',
    desc: 'REVIEW — blast radius, API contracts, mermaid',
    source: 'skill',
  },
  { name: 'graph-security', usage: '/graph-security', desc: 'Security audit — OWASP, STRIDE, SBOM', source: 'skill' },
  { name: 'graph-quality', usage: '/graph-quality', desc: 'Refactoring audit — SOLID, DRY, McCabe', source: 'skill' },
  { name: 'graph-handoff', usage: '/graph-handoff', desc: 'HANDOFF — PR, snapshot, knowledge export', source: 'skill' },
  { name: 'graph-deploy', usage: '/graph-deploy', desc: 'DEPLOY — release health, CI pipeline', source: 'skill' },
  {
    name: 'graph-listening',
    usage: '/graph-listening',
    desc: 'LISTENING — retrospective, CFD, feedback',
    source: 'skill',
  },
  { name: 'graph-heal', usage: '/graph-heal', desc: 'Cross-cutting — auto-cura MAPE-K + navegacao', source: 'skill' },
  {
    name: 'graph-navigation',
    usage: '/graph-navigation [--auto]',
    desc: 'Navegacao em 6 passos: heal + learn + verify + scaffold + boilerplate + dogfood',
    source: 'cmd',
  },

  // ── Dashboard / Economy views ────────────────────────────────────
  {
    name: 'dashboard',
    aliases: ['db'],
    usage: '/dashboard',
    desc: 'Multi-panel dashboard with gauges, sparklines, metrics',
  },
  {
    name: 'token-budget',
    aliases: ['tb'],
    usage: '/token-budget',
    desc: 'Token economy — budget vs usage, spikes, forecast',
  },
  {
    name: 'cost-forecast',
    aliases: ['cf'],
    usage: '/cost-forecast',
    desc: 'Daily cost projection with trend analysis',
  },
  {
    name: 'cache-heatmap',
    aliases: ['ch'],
    usage: '/cache-heatmap',
    desc: 'Cache hit rates — session, tool, artifact layers',
  },
  {
    name: 'workflow-viz',
    aliases: ['wv', 'pipeline'],
    usage: '/workflow-viz',
    desc: 'Pipeline visualization with phase gate map',
  },

  // ── Algorithmic commands (CLRS 4th Ed implementations) ──────────────
  // Graph algorithms (Part VI)
  {
    name: 'critical-path',
    aliases: ['cp'],
    usage: '/critical-path',
    desc: 'Critical path (longest path in DAG) — min project duration',
  },
  {
    name: 'topological-sort',
    aliases: ['tsort'],
    usage: '/topological-sort',
    desc: 'Kahn topological sort — linear task ordering',
  },
  {
    name: 'dijkstra',
    aliases: ['sp'],
    usage: '/dijkstra <sourceId> [targetId]',
    desc: 'Shortest dependency chain (non-negative weights)',
  },
  {
    name: 'bellman-ford',
    aliases: ['bf'],
    usage: '/bellman-ford <sourceId>',
    desc: 'Shortest paths with negative weight detection',
  },
  {
    name: 'floyd-warshall',
    aliases: ['fw', 'apsp'],
    usage: '/floyd-warshall',
    desc: 'All-pairs shortest paths — full distance matrix',
  },
  { name: 'scc', usage: '/scc', desc: 'Tarjan strongly connected components — cycle detection' },
  { name: 'bfs', usage: '/bfs <nodeId>', desc: 'Breadth-first search traversal from node' },
  { name: 'dfs', usage: '/dfs <nodeId>', desc: 'Depth-first search traversal from node' },
  { name: 'mst', usage: '/mst', desc: 'Kruskal+Prii minimum spanning tree' },
  {
    name: 'max-flow',
    aliases: ['flow', 'bottleneck'],
    usage: '/max-flow <sourceId> <sinkId>',
    desc: 'Ford-Fulkerson max flow — bottleneck detection',
  },
  {
    name: 'hungarian',
    aliases: ['assign'],
    usage: '/hungarian [costMatrix]',
    desc: 'Hungarian algorithm — optimal task-to-agent assignment',
  },
  {
    name: 'page-rank',
    aliases: ['pr'],
    usage: '/page-rank',
    desc: 'PageRank centrality — most important nodes by dep graph',
  },
  {
    name: 'centrality',
    aliases: ['central'],
    usage: '/centrality',
    desc: 'Betweenness/closeness/degree centrality — most influential nodes',
  },
  {
    name: 'graph-metrics',
    aliases: ['gm'],
    usage: '/graph-metrics',
    desc: 'Density, diameter, avg degree — graph health stats',
  },
  {
    name: 'articulation-points',
    aliases: ['ap', 'cut'],
    usage: '/articulation-points',
    desc: 'Cut vertices — single points of failure',
  },
  { name: 'bridges', usage: '/bridges', desc: 'Critical edges — connection breakpoints' },

  // DP + Greedy + String (Ch. 14-16, 32)
  {
    name: 'knapsack',
    aliases: ['ks'],
    usage: '/knapsack [capacity]',
    desc: '0/1 knapsack — optimal sprint selection under capacity',
  },
  { name: 'lcs', usage: '/lcs <string1> <string2>', desc: 'Longest common subsequence — pattern similarity' },
  {
    name: 'rod-cutting',
    aliases: ['rod'],
    usage: '/rod-cutting [length]',
    desc: 'Rod cutting DP — optimal feature decomposition',
  },
  {
    name: 'edit-distance',
    aliases: ['ed', 'levenshtein'],
    usage: '/edit-distance <string1> <string2>',
    desc: 'Levenshtein distance — fuzzy dedup detection',
  },
  {
    name: 'activity-select',
    aliases: ['schedule'],
    usage: '/activity-select',
    desc: 'Greedy activity selection — max tasks in window',
  },
  { name: 'huffman', aliases: ['huff'], usage: '/huffman', desc: 'Huffman coding — task prioritization by frequency' },
  { name: 'rabin-karp', aliases: ['rk'], usage: '/rabin-karp <text> <pattern>', desc: 'Rolling hash string matching' },
  {
    name: 'suffix-search',
    aliases: ['sa'],
    usage: '/suffix-search <text> <pattern>',
    desc: 'Suffix array binary search — O(log n) substring lookup',
  },

  // Probabilistic + Simulation (Ch. 5, App. C)
  {
    name: 'monte-carlo',
    aliases: ['mc', 'sim'],
    usage: '/monte-carlo [trials]',
    desc: 'Monte Carlo simulation — completion date distribution',
  },
  {
    name: 'bayesian',
    aliases: ['bayes'],
    usage: '/bayesian <prior> <likelihood> <evidence>',
    desc: 'Bayesian inference — risk prediction from priors',
  },
  {
    name: 'markov',
    aliases: ['mkv'],
    usage: '/markov [steps]',
    desc: 'Markov chain — state transition probability modeling',
  },

  // Queueing + Flow Theory
  {
    name: 'flow-efficiency',
    aliases: ['fe', 'littles'],
    usage: '/flow-efficiency',
    desc: "Little's Law + CFD — cycle time, throughput, WIP",
  },
  {
    name: 'queue-sim',
    aliases: ['mm1'],
    usage: '/queue-sim [lambda] [mu]',
    desc: 'M/M/1 queue simulation — WIP optimization',
  },
  {
    name: 'kalman',
    aliases: ['kf'],
    usage: '/kalman <val1,val2,...>',
    desc: 'Kalman filter — smoothed velocity/noise reduction',
  },
  { name: 'cfd', usage: '/cfd', desc: 'Cumulative flow diagram — sprint flow visualization' },

  // Machine Learning (Ch. 33)
  { name: 'cluster', aliases: ['kmeans'], usage: '/cluster [k]', desc: 'K-means clustering — automatic task grouping' },
  {
    name: 'gradient-descent',
    aliases: ['gd'],
    usage: '/gradient-descent',
    desc: 'Gradient descent — cost/effort optimization',
  },
  {
    name: 'weighted-majority',
    aliases: ['wm', 'experts'],
    usage: '/weighted-majority',
    desc: 'Multiplicative weights — ensemble risk assessment',
  },

  // Optimization (Ch. 29, 34-35)
  { name: 'linear-program', aliases: ['lp'], usage: '/linear-program', desc: 'LP optimal resource allocation' },
  { name: 'set-cover', aliases: ['cover'], usage: '/set-cover', desc: 'Greedy set cover — min tasks to cover all ACs' },
  { name: 'tsp', aliases: ['tsp-approx'], usage: '/tsp', desc: 'TSP nearest neighbor — optimal review order' },
  {
    name: 'vertex-cover',
    aliases: ['vc'],
    usage: '/vertex-cover',
    desc: '2-approximation vertex cover — min reviewers',
  },
  {
    name: 'genetic',
    aliases: ['ga'],
    usage: '/genetic [population] [generations]',
    desc: 'Genetic algorithm — multi-objective scheduling',
  },
  {
    name: 'branch-bound',
    aliases: ['bb'],
    usage: '/branch-bound [costMatrix]',
    desc: 'Branch and bound — optimal task assignment',
  },
  {
    name: 'backtrack',
    aliases: ['bt', 'backtracking'],
    usage: '/backtrack',
    desc: 'Backtracking search — constraint satisfaction',
  },

  // Statistical (App. C-D)
  {
    name: 'chi-square',
    aliases: ['chisq', 'x2'],
    usage: '/chi-square <val1,val2,...> [expected]',
    desc: 'Chi-squared test — sprint health validation',
  },
  {
    name: 'linear-regression',
    aliases: ['lr', 'trend'],
    usage: '/linear-regression velocity',
    desc: 'OLS velocity trend and sprint forecasting',
  },
  { name: 'entropy', aliases: ['ent'], usage: '/entropy', desc: 'Shannon entropy — task complexity scoring' },
  {
    name: 'quickselect',
    aliases: ['qs', 'kth'],
    usage: '/quickselect [k]',
    desc: 'Randomized quickselect — median/percentile estimates',
  },
  {
    name: 'seasonality',
    aliases: ['season'],
    usage: '/seasonality [period]',
    desc: 'Seasonal decomposition — cyclical pattern detection',
  },
  // ── Lifecycle commands (node_454fbdf2fa3e) ─────────────────────────────────
  {
    name: 'spec',
    usage: '/spec [generate|validate|list-templates] [template]',
    desc: 'Gera e valida specs por fase (PRD, ADR, task)',
  },
  {
    name: 'forecast',
    usage: '/forecast [--weeks <n>]',
    desc: 'Previsão de ETA do backlog com 95% CI (velocity trend)',
  },
  { name: 'swarm', usage: '/swarm <goal> [--agents <n>]', desc: 'Lança swarm de agentes para uma meta' },
  { name: 'snapshot', usage: '/snapshot [create|list|restore <id>]', desc: 'Cria e restaura snapshots do grafo' },
  { name: 'template', usage: '/template [apply|list] <name>', desc: 'Aplica templates de workflow ao grafo' },
  { name: 'plugin', usage: '/plugin [list|install|remove] [name]', desc: 'Gerencia plugins do agf' },
  { name: 'hooks', usage: '/hooks [list|add|remove] [event]', desc: 'Gerencia hooks de lifecycle do agf' },
  {
    name: 'lint-files',
    usage: '/lint-files [--fix] [path]',
    desc: 'Lint de arquivos do workspace com relatório de violações',
  },
]
