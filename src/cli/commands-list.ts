/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The full agf command surface — extracted from index.ts (which crossed the
 * 800-line file-size gate) to keep the CLI bootstrap thin. Each entry lazy-
 * loads its command module; nothing here runs at import time.
 */
import type { Command } from 'commander'

export interface CliCommandEntry {
  name: string
  description: string
  loader: () => Promise<Command>
}

export const commands: CliCommandEntry[] = [
  {
    name: 'import-prd',
    description: 'Import a PRD file into the graph',
    loader: () => import('./commands/import-cmd.js').then((m) => m.importCommand()),
  },
  {
    name: 'compress',
    description: 'Compressor de saída de ferramenta: filtros, discover, teste',
    loader: () => import('./commands/compress-cmd.js').then((m) => m.compressCommand()),
  },
  {
    name: 'economy',
    description: 'Toggle/list opt-in bio/math token-economy levers',
    loader: () => import('./commands/economy-cmd.js').then((m) => m.economyCommand()),
  },
  {
    name: 'exec',
    description: 'Executa comandos agf em composição (pipe, chain)',
    loader: () => import('./commands/exec-cmd.js').then((m) => m.execCommand()),
  },
  {
    name: 'eval',
    description: 'Suíte de cenários reais → scorecard (resolve% × custo-por-sucesso)',
    loader: () => import('./commands/eval-cmd.js').then((m) => m.evalCommand()),
  },
  {
    name: 'scan',
    description: 'Agrega findings de qualidade (harness, LSP, lint) num envelope unificado',
    loader: () => import('./commands/scan-cmd.js').then((m) => m.scanCommand()),
  },
  {
    name: 'scan-repos',
    description: 'Explora repos vizinhos: fingerprint + diff de capacidades vs agf → insights ranqueados',
    loader: () => import('./commands/scan-repos-cmd.js').then((m) => m.scanReposCommand()),
  },
  {
    name: 'wire-dormant',
    description: 'Lista capacidades dormentes e injeta WIRE-tasks no backlog (dry-run por default)',
    loader: () => import('./commands/wire-dormant-cmd.js').then((m) => m.wireDormantCommand()),
  },
  {
    name: 'scan-binaries',
    description: 'Write SCANINFO.json (release trust: sha256+signature+VirusTotal verdict) next to BUILDINFO',
    loader: () => import('./commands/scan-binaries-cmd.js').then((m) => m.scanBinariesCommand()),
  },
  {
    name: 'mrd',
    description: 'Detect merge/review/deprecate candidates in the graph (from existing graph data, zero token)',
    loader: () => import('./commands/mrd-cmd.js').then((m) => m.mrdCommand()),
  },
  {
    name: 'changelog',
    description: 'Generate Keep-a-Changelog sections from conventional commits in a git ref range',
    loader: () => import('./commands/changelog-cmd.js').then((m) => m.changelogCommand()),
  },
  {
    name: 'wave12-5w2h',
    description: 'Print the Wave-12 Sandbox Build 5W2H strategic planning document',
    loader: () => import('./commands/wave12-5w2h-cmd.js').then((m) => m.wave125w2hCommand()),
  },
  {
    name: 'help',
    description: 'Friendly command index + first steps',
    loader: () => import('./commands/help-cmd.js').then((m) => m.helpCommand()),
  },
  {
    name: 'reference',
    description: 'Print the compiled agf reference guide (tools, skills, phases, gates)',
    loader: () => import('./commands/reference-cmd.js').then((m) => m.referenceCommand()),
  },
  {
    name: 'status',
    description: 'Unified panel: provider/model/cache + tokens/$ + savings',
    loader: () => import('./commands/status-cmd.js').then((m) => m.statusCommand()),
  },
  {
    name: 'phase',
    description: 'Manage lifecycle phase detection',
    loader: () => import('./commands/phase-cmd.js').then((m) => m.phaseCommand()),
  },
  {
    name: 'next',
    description: 'Suggest the next task to work on',
    loader: () => import('./commands/next-cmd.js').then((m) => m.nextCommand()),
  },
  {
    name: 'hooks',
    description: 'Inspect the 28-point hook taxonomy (list/test/discover)',
    loader: () => import('./commands/hooks-cmd.js').then((m) => m.hooksCommand()),
  },
  {
    name: 'decompose',
    description: 'Decompose tasks into subtasks',
    loader: () => import('./commands/decompose-cmd.js').then((m) => m.decomposeCommand()),
  },
  {
    name: 'sequence',
    description: "Auto-sequence a parent's children into a depends_on chain (WIP=1)",
    loader: () => import('./commands/sequence-cmd.js').then((m) => m.sequenceCommand()),
  },
  {
    name: 'role',
    description: 'Register/inspect the agent role (implementor/reviewer/validator) for a task',
    loader: () => import('./commands/role-cmd.js').then((m) => m.roleCommand()),
  },
  {
    name: 'check',
    description: 'Run DoD validation checks',
    loader: () => import('./commands/check-cmd.js').then((m) => m.checkCommand()),
  },
  {
    name: 'validate',
    description: 'Report-only validator checks (ac/dor/dod/integrity/flow), dispatched by --action',
    loader: () => import('./commands/validate-cmd.js').then((m) => m.validateCommand()),
  },
  {
    name: 'code',
    description: 'Code intelligence: index, search, navigate, impact analysis, LSP diagnostics',
    loader: () => import('./commands/code-cmd.js').then((m) => m.codeCommand()),
  },
  {
    name: 'autopilot',
    description: 'Run autonomous sprint execution',
    loader: () => import('./commands/autopilot-cmd.js').then((m) => m.autopilotCommand()),
  },
  {
    name: 'run',
    description: 'One-shot ad-hoc execution',
    loader: () => import('./commands/run-cmd.js').then((m) => m.runCommand()),
  },
  {
    name: 'model',
    description: 'Manage tier-router model config',
    loader: () => import('./commands/model-cmd.js').then((m) => m.modelCommand()),
  },
  {
    name: 'gearshift',
    description: 'Manual gear (1-4) for model/effort — reflects in ~/.claude/settings.json',
    loader: () => import('./commands/gearshift-cmd.js').then((m) => m.gearshiftCommand()),
  },
  {
    name: 'verify-ac',
    description: "Check whether a node's AC is already satisfied by existing code before implementing from scratch",
    loader: () => import('./commands/verify-ac-cmd.js').then((m) => m.verifyAcCommand()),
  },
  {
    name: 'wire-check',
    description: 'Signal mock-gated branches (useMock=false, !mock) never activated by any real (non-test) caller',
    loader: () => import('./commands/wire-check-cmd.js').then((m) => m.wireCheckCommand()),
  },
  {
    name: 'sandbox',
    description: 'Wave-12 sandbox: stack detection (npm/maven/gradle/go/pip) and process-isolated builds',
    loader: () => import('./commands/sandbox-cmd.js').then((m) => m.sandboxCommand()),
  },
  {
    name: 'welcome',
    description: 'Zero-token orientation: stats + next task + lifecycle skills',
    loader: () => import('./commands/welcome-cmd.js').then((m) => m.welcomeCommand()),
  },
  {
    name: 'stats',
    description: 'Show graph statistics',
    loader: () => import('./commands/stats-cmd.js').then((m) => m.statsCommand()),
  },
  {
    name: 'recent',
    description: 'Lista pastas de projeto recentemente usadas (StoreManager.swap)',
    loader: () => import('./commands/recent-cmd.js').then((m) => m.recentCommand()),
  },
  {
    name: 'metrics',
    description: 'Show token and cost metrics',
    loader: () => import('./commands/metrics-cmd.js').then((m) => m.metricsCommand()),
  },
  {
    name: 'flow',
    description: 'Toggle/inspect flow context dilution (Φ/λ_flow)',
    loader: () => import('./commands/flow-cmd.js').then((m) => m.flowCommand()),
  },
  {
    name: 'cache',
    description: 'Prompt-cache management and statistics (cache stats)',
    loader: () => import('./commands/cache-cmd.js').then((m) => m.cacheCommand()),
  },
  {
    name: 'insights',
    description: 'Deterministic graph analytics (DORA, bottlenecks, phases)',
    loader: () => import('./commands/insights-cmd.js').then((m) => m.insightsCommand()),
  },
  {
    name: 'gate',
    description: 'Run phase-readiness gates (design/review/handoff/deploy/listening)',
    loader: () => import('./commands/gate-cmd.js').then((m) => m.gateCommand()),
  },
  {
    name: 'lifecycle',
    description: 'Fan out analyze() modes for a lifecycle phase into one report (ANALYZE..LISTENING)',
    loader: () => import('./commands/lifecycle-cmd.js').then((m) => m.lifecycleCommand()),
  },
  {
    name: 'gaps',
    description: 'Detect SHAPE completeness gaps + emit driver-agnostic enrichment requests (zero MCP)',
    loader: () => import('./commands/gaps-cmd.js').then((m) => m.gapsCommand()),
  },
  {
    name: 'brief',
    description: 'Generate the delegation brief (ExecutorBrief spec) for a task node — markdown | json | claude-prompt',
    loader: () => import('./commands/brief-cmd.js').then((m) => m.briefCommand()),
  },
  {
    name: 'preflight',
    description: 'Golden-rule guard: git-history + graph dedupe before implementing (zero MCP, ~0 token)',
    loader: () => import('./commands/preflight-cmd.js').then((m) => m.preflightCommand()),
  },
  {
    name: 'retrieve',
    description: 'Retrieve a cached CCR original by hash (optionally BM25-ranked by --query)',
    loader: () => import('./commands/retrieve-cmd.js').then((m) => m.retrieveCommand()),
  },
  {
    name: 'hash-content',
    description: 'Stable content hash for a TS/JS file — comments/whitespace-noise-free (ADR-0048)',
    loader: () => import('./commands/hash-content-cmd.js').then((m) => m.hashContentCommand()),
  },
  {
    name: 'rules-filter',
    description: 'Filter a rule-pack catalogue JSON to the active language stack',
    loader: () => import('./commands/rules-filter-cmd.js').then((m) => m.rulesFilterCommand()),
  },
  {
    name: 'kanban',
    description: 'Render the Kanban board (status, WIP, flow metrics)',
    loader: () => import('./commands/kanban-cmd.js').then((m) => m.kanbanCommand()),
  },
  {
    name: 'approval',
    description: 'Approval token lifecycle (create → grant → verify → consume/revoke)',
    loader: () => import('./commands/approval-cmd.js').then((m) => m.approvalCommand()),
  },
  {
    name: 'question',
    description: 'Human-in-the-loop question lifecycle (ask → reply/reject → list)',
    loader: () => import('./commands/question-cmd.js').then((m) => m.questionCommand()),
  },
  {
    name: 'adr',
    description: 'Architecture Decision Records (create, list)',
    loader: () => import('./commands/adr-cmd.js').then((m) => m.adrCommand()),
  },
  {
    name: 'learning',
    description: 'Persisted learning: per-agent performance, routing, export',
    loader: () => import('./commands/learning-cmd.js').then((m) => m.learningCommand()),
  },
  {
    name: 'heal',
    description: 'Self-healing do grafo (MAPE-K) com persistência',
    loader: () => import('./commands/heal-cmd.js').then((m) => m.healCommand()),
  },
  {
    name: 'knowledge-compile',
    description: 'Ingere/compila uma source em CompiledPage (structured + links + version)',
    loader: () => import('./commands/knowledge-compile-cmd.js').then((m) => m.knowledgeCompileCommand()),
  },
  {
    name: 'knowledge-lint',
    description: 'Lint read-only do knowledge store (findings sem deleção)',
    loader: () => import('./commands/knowledge-lint-cmd.js').then((m) => m.knowledgeLintCommand()),
  },
  {
    name: 'knowledge-learn',
    description: "Importa conhecimento de outro projeto's graph.db (memories/decisions/patterns)",
    loader: () => import('./commands/knowledge-learn-cmd.js').then((m) => m.knowledgeLearnCommand()),
  },
  {
    name: 'federation',
    description: 'Federação de conhecimento entre projetos (peer registry + tick)',
    loader: () => import('./commands/federation-cmd.js').then((m) => m.federationCommand()),
  },
  {
    name: 'out-of-scope',
    description: 'Decisões de escopo descartadas (.out-of-scope/*.md) — evita re-litigar a mesma ideia',
    loader: () => import('./commands/out-of-scope-cmd.js').then((m) => m.outOfScopeCommand()),
  },
  {
    name: 'ubiquitous-language',
    description: 'Vocabulário canonical do domínio — seção "## Vocabulário Canonical" em CONTEXT.md',
    loader: () => import('./commands/ubiquitous-language-cmd.js').then((m) => m.ubiquitousLanguageCommand()),
  },
  {
    name: 'prediction-feedback',
    description: 'Loop de correção de previsões erradas — busca por erros passados antes de repeti-los',
    loader: () => import('./commands/prediction-feedback-cmd.js').then((m) => m.predictionFeedbackCommand()),
  },
  {
    name: 'dataset',
    description: 'Datasets persistentes para avaliação — manuais, de traces reais, ou de decision logs',
    loader: () => import('./commands/dataset-cmd.js').then((m) => m.datasetCommand()),
  },
  {
    name: 'quality-policy',
    description: 'Políticas declarativas de qualidade — gates block/warn sobre métricas nomeadas',
    loader: () => import('./commands/quality-policy-cmd.js').then((m) => m.qualityPolicyCommand()),
  },
  {
    name: 'permissions',
    description: 'ACL de projeto (allow/deny/ask) por ação/recurso',
    loader: () => import('./commands/permissions-cmd.js').then((m) => m.permissionsCommand()),
  },
  {
    name: 'trace',
    description: 'Traces de execução persistentes — spans, custo e latência',
    loader: () => import('./commands/trace-cmd.js').then((m) => m.traceCommand()),
  },
  {
    name: 'guardrail',
    description: 'Guardrails de qualidade persistidos — pre/post checks com fail_open/fail_closed',
    loader: () => import('./commands/guardrail-cmd.js').then((m) => m.guardrailCommand()),
  },
  {
    name: 'scenario',
    description: 'Roda a suíte de self-check ScenarioRunner (mutation/property testing, DB real em memória)',
    loader: () => import('./commands/scenario-cmd.js').then((m) => m.scenarioCommand()),
  },
  {
    name: 'parse-api',
    description: 'Parseia OpenAPI 2.0/3.0 (YAML/JSON) ou WSDL em endpoints + schemas estruturados',
    loader: () => import('./commands/parse-api-cmd.js').then((m) => m.parseApiCommand()),
  },
  {
    name: 'cycle-repair',
    description: 'Detecta ciclos de dependência e propõe correções (ADR-0061) — report-only por padrão',
    loader: () => import('./commands/cycle-repair-cmd.js').then((m) => m.cycleRepairCommand()),
  },
  {
    name: 'reclassify-structural',
    description: 'Reclassifica nodes com título estrutural (TIER X, Roadmap...) como implementable=false',
    loader: () => import('./commands/reclassify-structural-cmd.js').then((m) => m.reclassifyStructuralCommand()),
  },
  {
    name: 'replan-analyze',
    description: 'Analisa saúde do sprint (cycle-time divergence, parent-blocking) e propõe replanejamento',
    loader: () => import('./commands/replan-analyze-cmd.js').then((m) => m.replanAnalyzeCommand()),
  },
  {
    name: 'immune',
    description: 'Sistema Imune: detecção e recuperação Danger Theory em código-fonte',
    loader: () => import('./commands/immune-cmd.js').then((m) => m.immuneCommand()),
  },
  {
    name: 'scaffold',
    description: 'Geração determinística de scaffold/boilerplate (acoplador determinístico)',
    loader: () => import('./commands/scaffold-cmd.js').then((m) => m.scaffoldCommand()),
  },
  {
    name: 'login',
    description: 'Authenticate with GitHub Copilot',
    loader: () => import('./commands/login-cmd.js').then((m) => m.loginCommand()),
  },
  {
    name: 'logout',
    description: 'Clear authentication',
    loader: () => import('./commands/login-cmd.js').then((m) => m.logoutCommand()),
  },
  {
    name: 'init',
    description: 'Initialize a project graph',
    loader: () => import('./commands/init-cmd.js').then((m) => m.initCommand()),
  },
  {
    name: 'install-neural',
    description: 'Install ONNX runtime + model to enable neural RAG embeddings',
    loader: () => import('./commands/install-neural-cmd.js').then((m) => m.installNeuralCommand()),
  },
  {
    name: 'dashboard',
    description: 'Start the agf progress dashboard server',
    loader: () => import('./commands/dashboard-cmd.js').then((m) => m.dashboardCommand()),
  },
  {
    name: 'marketplace',
    description: 'Manage the agf skill/plugin marketplace',
    loader: () => import('./commands/marketplace-cmd.js').then((m) => m.marketplaceCommand()),
  },
  {
    name: 'daemon',
    description: 'Manage the local daemon service',
    loader: () => import('./commands/daemon-cmd.js').then((m) => m.daemonCommand()),
  },
  {
    name: 'doctor',
    description: 'Run environment diagnostics',
    loader: () => import('./commands/doctor-cmd.js').then((m) => m.doctorCommand()),
  },
  {
    name: 'docs',
    description: 'Inspect the local docs cache (list/search/sync) or generate living graph docs (`docs generate`)',
    loader: () => import('./commands/docs-cmd.js').then((m) => m.docsCommand()),
  },
  {
    name: 'gc',
    description: 'Run garbage collection',
    loader: () => import('./commands/gc-cmd.js').then((m) => m.gcCommand()),
  },
  {
    name: 'colony-health',
    description: 'Show colony health status and snapshot history (--history)',
    loader: () => import('./commands/colony-health-cmd.js').then((m) => m.colonyHealthCommand()),
  },
  {
    name: 'agent',
    description: 'Agent role management: create (scaffold TOML) | list (built-in + project)',
    loader: () => import('./commands/agent-cmd.js').then((m) => m.agentCommand()),
  },
  {
    name: 'caste',
    description: 'Colony caste taxonomy: list|show (model_tier, max_complexity, task_types)',
    loader: () => import('./commands/caste-cmd.js').then((m) => m.casteCommand()),
  },
  {
    name: 'skill',
    description: 'Manage lifecycle skills',
    loader: () => import('./commands/skill-cmd.js').then((m) => m.skillCommand()),
  },
  {
    name: 'profile',
    description: 'Manage config profiles',
    loader: () => import('./commands/profile-cmd.js').then((m) => m.profileCommand()),
  },
  {
    name: 'config',
    description: 'Get, set, or list project config settings',
    loader: () => import('./commands/config-cmd.js').then((m) => m.configCommand()),
  },
  {
    name: 'principles',
    description: 'Manage governing principles',
    loader: () => import('./commands/principles-cmd.js').then((m) => m.principlesCommand()),
  },
  {
    name: 'generate-prd',
    description: 'Generate a PRD from an idea',
    loader: () => import('./commands/generate-prd-cmd.js').then((m) => m.generatePrdCommand()),
  },
  {
    name: 'ant',
    description:
      'Worktree-por-formiga: spawn|list|rm cria worktree isolado por agente, todas as formigas no MESMO grafo central (AGF_GRAPH_ROOT)',
    loader: () => import('./commands/ant-cmd.js').then((m) => m.antCommand()),
  },
  {
    name: 'genesis',
    description:
      'Criar um projeto do zero: ideia → grafo → primeiro brief em 1 round-trip (init → generate_prd → import_prd → decompose → gaps → brief)',
    loader: () => import('./commands/genesis-cmd.js').then((m) => m.genesisCommand()),
  },
  {
    name: 'build',
    description: 'Full lifecycle cycle with gates',
    loader: () => import('./commands/build-cmd.js').then((m) => m.buildCommand()),
  },
  {
    name: 'deliver',
    description: 'Request → PRD → graph → TDD build (autonomous, one command)',
    loader: () => import('./commands/deliver-cmd.js').then((m) => m.deliverCommand()),
  },
  {
    name: 'quality',
    description: 'Run quality gate 95/95',
    loader: () => import('./commands/quality-cmd.js').then((m) => m.qualityCommand()),
  },
  {
    name: 'ac',
    description: 'AC quality tools (harden weak ACs to GWT)',
    loader: () => import('./commands/ac-cmd.js').then((m) => m.acCommand()),
  },
  {
    name: 'tdd-score',
    description: 'Compute TDD quality score (0–100) for a task',
    loader: () => import('./commands/tdd-score-cmd.js').then((m) => m.tddScoreCommand()),
  },
  {
    name: 'okr',
    description: 'OKR cockpit — objective, KR attainment and derived status per epic',
    loader: () => import('./commands/okr-cmd.js').then((m) => m.okrCommand()),
  },
  {
    name: 'certainty',
    description: 'Delivery Certainty — verdict "is it REALLY done?" with the means (pillars) explicit',
    loader: () => import('./commands/certainty-cmd.js').then((m) => m.certaintyCommand()),
  },
  {
    name: 'ui',
    description: 'Start minimal web progress UI',
    loader: () => import('./commands/ui-cmd.js').then((m) => m.uiCommand()),
  },
  {
    name: 'provider',
    description: 'Manage LLM providers',
    loader: () => import('./commands/provider-cmd.js').then((m) => m.providerCommand()),
  },
  {
    name: 'claims',
    description: 'List active agent lease claims on graph tasks (read-only visibility)',
    loader: () => import('./commands/claims-cmd.js').then((m) => m.claimsCommand()),
  },
  {
    name: 'swarm',
    description: 'Multi-agent fabric over the graph: session/claim/mailbox/consensus (opt-in)',
    loader: () => import('./commands/swarm-cmd.js').then((m) => m.swarmCommand()),
  },
  {
    name: 'provenance',
    description: 'Epistemic-tier ladder: promote/downgrade/hash (honesty gates, local)',
    loader: () => import('./commands/provenance-cmd.js').then((m) => m.provenanceCommand()),
  },
  {
    name: 'backfill-provenance',
    description: 'Attribute nodes missing source_file by inheriting the closest ancestor along parent_of edges',
    loader: () => import('./commands/backfill-provenance-cmd.js').then((m) => m.backfillProvenanceCommand()),
  },
  {
    name: 'harness',
    description: 'Run harnessability scan',
    loader: () => import('./commands/harness-cmd.js').then((m) => m.harnessCommand()),
  },
  {
    name: 'lsp',
    description: 'Language server bridge: status of configured servers',
    loader: () => import('./commands/lsp-cmd.js').then((m) => m.lspCommand()),
  },
  {
    name: 'mcp',
    description: 'Remote MCP client inspection (transport/auth state, no network calls)',
    loader: () => import('./commands/mcp-cmd.js').then((m) => m.mcpCommand()),
  },
  {
    name: 'web-parity',
    description: 'Deterministic gap report — CLI capabilities without a corresponding web dashboard view',
    loader: () => import('./commands/web-parity-cmd.js').then((m) => m.webParityCommand()),
  },
  {
    name: 'session',
    description: 'Inspect the unified session/runtime read-model (show, grants, events)',
    loader: () => import('./commands/session-cmd.js').then((m) => m.sessionCommand()),
  },
  {
    name: 'constitution',
    description: 'Manage project constitution',
    loader: () => import('./commands/constitution-cmd.js').then((m) => m.constitutionCommand()),
  },
  {
    name: 'plugin',
    description: 'Manage plugin extensions',
    loader: () => import('./commands/plugin-cmd.js').then((m) => m.pluginCommand()),
  },
  {
    name: 'preset',
    description: 'Manage workflow presets',
    loader: () => import('./commands/preset-cmd.js').then((m) => m.presetCommand()),
  },
  {
    name: 'spec',
    description: 'Generate and validate specs',
    loader: () => import('./commands/spec-cmd.js').then((m) => m.specCommand()),
  },
  {
    name: 'spec-sync',
    description: 'Living specs: register/list/status/link (versioned)',
    loader: () => import('./commands/spec-sync-cmd.js').then((m) => m.specSyncCommand()),
  },
  {
    name: 'template',
    description: 'Reusable decomposition templates (list, apply)',
    loader: () => import('./commands/template-cmd.js').then((m) => m.templateCommand()),
  },
  {
    name: 'upgrade',
    description: 'Self-update the standalone binary to the latest published version',
    loader: () => import('./commands/upgrade-cmd.js').then((m) => m.upgradeCommand()),
  },
  {
    name: 'node',
    description: 'CRUD e mutações de nós (add/show/update/status/move/clone/rm) — zero MCP',
    loader: () => import('./commands/node-cmd.js').then((m) => m.nodeCommand()),
  },
  {
    name: 'edge',
    description: 'CRUD de arestas (add/rm/ls) — zero MCP',
    loader: () => import('./commands/edge-cmd.js').then((m) => m.edgeCommand()),
  },
  {
    name: 'implementer',
    description: 'Transição de lifecycle atribuída a um agente (start/progress/done), com validação de boundary',
    loader: () => import('./commands/implementer-cmd.js').then((m) => m.implementerCommand()),
  },
  {
    name: 'query',
    description: 'Consulta nós por tipo/status/parent/texto (query_graph/list)',
    loader: () => import('./commands/query-cmd.js').then((m) => m.queryCommand()),
  },
  {
    name: 'audit',
    description: 'Consulta o audit trail de tool calls (queryAuditLog/formatAuditEntry)',
    loader: () => import('./commands/audit-cmd.js').then((m) => m.auditCommand()),
  },
  {
    name: 'sandbox-gate',
    description: 'Utilitários de sandbox fs/network (PermissionsGate) — `sandbox-gate check <command>`',
    loader: () => import('./commands/sandbox-gate-cmd.js').then((m) => m.sandboxGateCommand()),
  },
  {
    name: 'exec-policy',
    description: 'Utilitários de aprovação de comandos shell (ShellEscalation) — `exec-policy check <command>`',
    loader: () => import('./commands/exec-policy-cmd.js').then((m) => m.execPolicyCommand()),
  },
  {
    name: 'context',
    description: 'Emite o context-pack (compact) de um nó',
    loader: () => import('./commands/context-cmd.js').then((m) => m.contextCommand()),
  },
  {
    name: 'memory',
    description: 'Gerencia memórias do projeto (write/read/list/rm)',
    loader: () => import('./commands/memory-cmd.js').then((m) => m.memoryCommand()),
  },
  {
    name: 'artifacts',
    description: 'Artefatos estruturados de subtask (diff/file/interface/decision/note) — v11 context-pollination',
    loader: () => import('./commands/artifacts-cmd.js').then((m) => m.artifactsCommand()),
  },
  {
    name: 'snapshot',
    description: 'Cria/lista/restaura snapshots do grafo',
    loader: () => import('./commands/snapshot-cmd.js').then((m) => m.snapshotCommand()),
  },
  {
    name: 'workspace',
    description: 'Workspace state lifecycle (snapshot/track/restore/revert/diff) via WorkspaceStateService',
    loader: () => import('./commands/workspace-cmd.js').then((m) => m.workspaceCommand()),
  },
  {
    name: 'export',
    description: 'Serializa o grafo como JSON',
    loader: () => import('./commands/export-cmd.js').then((m) => m.exportCommand()),
  },
  {
    name: 'import-graph',
    description: 'Funde um grafo JSON exportado no projeto',
    loader: () => import('./commands/import-graph-cmd.js').then((m) => m.importGraphCommand()),
  },
  {
    name: 'search',
    description: 'Busca FTS5/BM25 sobre os nós do grafo',
    loader: () => import('./commands/search-cmd.js').then((m) => m.searchCommand()),
  },
  {
    name: 'web-search',
    description: 'Busca externa via Exa/Tavily (ExternalSearchPort), deduped + RRF-ranked',
    loader: () => import('./commands/web-search-cmd.js').then((m) => m.webSearchCommand()),
  },
  {
    name: 'retrieve-command',
    description: 'RAG-IN: recupera o comando exato para uma intenção (fallback --help)',
    loader: () => import('./commands/retrieve-command-cmd.js').then((m) => m.retrieveCommandCommand()),
  },
  {
    name: 'montar-output',
    description: 'RAG-OUT: recupera scaffold adequado (preenche slots) ou gera, por objetivo',
    loader: () => import('./commands/montar-output-cmd.js').then((m) => m.montarOutputCommand()),
  },
  {
    name: 'calibrate',
    description: 'Calibra o limiar do portão RAG por score×saved (lê o lever ledger)',
    loader: () => import('./commands/calibrate-cmd.js').then((m) => m.calibrateCommand()),
  },
  {
    name: 'learn-eval',
    description: 'Relatório de precisão do aprendizado ACO/bandit (accuracy, regret, Brier, ECE)',
    loader: () => import('./commands/learn-eval-cmd.js').then((m) => m.learnEvalCommand()),
  },
  {
    name: 'migrate-ac',
    description: 'Colapsa AC-nodes legados no ac[] do pai e os arquiva (dry-run por padrão)',
    loader: () => import('./commands/migrate-ac-cmd.js').then((m) => m.migrateAcCommand()),
  },
  {
    name: 'forecast',
    description: 'Métricas DORA do grafo',
    loader: () => import('./commands/forecast-cmd.js').then((m) => m.forecastCommand()),
  },
  {
    name: 'start',
    description: 'Start next task: wake-up + next + context + mark in_progress',
    loader: () => import('./commands/start-cmd.js').then((m) => m.startCommand()),
  },
  {
    name: 'dream',
    description: 'REM-inspired knowledge consolidation cycles (start/status/history/cancel)',
    loader: () => import('./commands/dream-cmd.js').then((m) => m.dreamCommand()),
  },
  {
    name: 'done',
    description: 'Complete task: DoD check + store memory + mark done + suggest next',
    loader: () => import('./commands/done-cmd.js').then((m) => m.doneCommand()),
  },
  {
    name: 'commit-scope',
    description: 'Commita exatamente os arquivos declarados do node (pathspec) — staged alheio fica intacto',
    loader: () => import('./commands/commit-scope-cmd.js').then((m) => m.commitScopeCommand()),
  },
  {
    name: 'submit',
    description: 'Modo delegado: ingere resultado do executor (brief) → blast → DoD → done',
    loader: () => import('./commands/submit-cmd.js').then((m) => m.submitCommand()),
  },
  {
    name: 'savings',
    description: 'Tabela cumulativa de economia de tokens',
    loader: () => import('./commands/savings-cmd.js').then((m) => m.savingsCommand()),
  },
  {
    name: 'loop',
    description: 'Re-run an agf command on an interval, or drive a goal-rubric loop until it passes',
    loader: () => import('./commands/loop-cmd.js').then((m) => m.loopCommand()),
  },
  {
    name: 'test',
    description: 'Run vitest tests, graph-aware (default: affected tests for current task)',
    loader: () => import('./commands/test-cmd.js').then((m) => m.testCommand()),
  },
  {
    name: 'lint',
    description: 'Run eslint on affected files (graph-aware) or entire project',
    loader: () => import('./commands/lint-cmd.js').then((m) => m.lintCommand()),
  },
  {
    name: 'lint-files',
    description: 'Check source files for 800-line compliance; exit 1 if violations found',
    loader: () => import('./commands/lint-files-cmd.js').then((m) => m.lintFilesCommand()),
  },
  {
    name: 'scan-silent-failures',
    description: "Scan a dir for masking fallbacks (|| [], || '', empty catch, @ts-expect-error)",
    loader: () => import('./commands/scan-silent-failures-cmd.js').then((m) => m.scanSilentFailuresCommand()),
  },
  {
    name: 'usage',
    description: 'Command usage analytics: track, report, auto-generate wrappers',
    loader: () => import('./commands/usage-cmd.js').then((m) => m.usageCommand()),
  },
  {
    name: 'pipeline',
    description: 'Compound commands: multiple operations in a single store cycle (faster)',
    loader: () => import('./commands/pipeline-cmd.js').then((m) => m.pipelineCommand()),
  },
  {
    name: 'risk',
    description: 'Risk management: triage open risks (promote/accept/close)',
    loader: () => import('./commands/risk-triage-cmd.js').then((m) => m.riskCommand()),
  },
  {
    name: 'sentrux',
    description: 'Sentrux MCP tool bridge: scan, session lifecycle, quality gates',
    loader: () => import('./commands/sentrux-cmd.js').then((m) => m.sentruxCommand()),
  },
  {
    name: 'spec-triage',
    description: 'Triage orphan spec-nodes (requirement/interface/contract without implementers)',
    loader: () => import('./commands/spec-triage-cmd.js').then((m) => m.specTriageParentCommand()),
  },
  {
    name: 'tui',
    description: 'Abre a TUI interativa (dashboard do grafo + tokens)',
    loader: () => import('./commands/tui-cmd.js').then((m) => m.tuiCommand()),
  },
]
