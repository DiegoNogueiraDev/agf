/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tool and harness reference content — analyze modes, knowledge pipeline, advanced tools, providers, MCP client, version.
 * WHY here: groups operational tool documentation distinct from skills and lifecycle phases.
 * Composing modules: re-exported via reference-content.ts barrel.
 * Needs: SERVICE_NAME, SERVICE_VERSION from '../utils/ecs-formatter.js'
 */

import { SERVICE_NAME, SERVICE_VERSION } from '../utils/ecs-formatter.js'

export const ANALYZE_MODES_SECTION = `### Modos do analyze por fase

| Fase | Modo | O que verifica |
|------|------|----------------|
| ANALYZE | \`prd_quality\` | Qualidade do PRD (completude, user stories, AC) |
| ANALYZE | \`scope\` | Escopo do grafo (tipos, distribuição, cobertura) |
| ANALYZE | \`ready\` | Definition of Ready (bloqueios, dependências, AC) |
| ANALYZE | \`risk\` | Riscos (complexidade, deps, tamanho, AC faltantes) |
| ANALYZE | \`blockers\` | Bloqueios transitivos de um node |
| ANALYZE | \`cycles\` | Ciclos de dependência no grafo |
| ANALYZE | \`critical_path\` | Caminho crítico (sequência mais longa de deps) |
| PLAN | \`decompose\` | Tasks grandes que precisam ser decompostas |
| DESIGN | \`adr\` | Validação de ADRs (Architecture Decision Records) |
| DESIGN | \`traceability\` | Matriz de rastreabilidade (req → task → test) |
| DESIGN | \`coupling\` | Acoplamento entre módulos |
| DESIGN | \`interfaces\` | Verificação de interfaces e contratos |
| DESIGN | \`tech_risk\` | Riscos técnicos (complexidade, stack, deps externas) |
| DESIGN | \`design_ready\` | Gate DESIGN→PLAN (pré-requisitos atendidos?) |
| IMPLEMENT | \`implement_done\` | Definition of Done (8 checks: 4 required + 4 recommended) |
| IMPLEMENT | \`tdd_check\` | Aderência TDD (specs sugeridos por AC) |
| IMPLEMENT | \`progress\` | Sprint burndown + velocity trend + blockers + ETA |
| VALIDATE | \`validate_ready\` | Gate IMPLEMENT→VALIDATE |
| VALIDATE | \`done_integrity\` | Integridade dos nodes marcados done |
| VALIDATE | \`status_flow\` | Fluxo de status válido (sem pulos) |
| REVIEW | \`review_ready\` | Gate VALIDATE→REVIEW |
| HANDOFF | \`handoff_ready\` | Gate REVIEW→HANDOFF |
| HANDOFF | \`doc_completeness\` | Completude de documentação |
| DEPLOY | \`deploy_ready\` | Gate HANDOFF→DEPLOY (snapshot, tasks done, no blocked) |
| DEPLOY | \`release_check\` | Validação de release readiness |
| LISTENING | \`listening_ready\` | Gate DEPLOY→LISTENING |
| LISTENING | \`backlog_health\` | Saúde do backlog (distribuição, aging) |
| PLAN | \`sprint_health\` | Saúde do sprint (burndown, bloqueios, health grade) |
| PLAN | \`auto_ready\` | Tasks que podem ser promovidas backlog → ready |
| DESIGN | \`contract_coverage\` | Cobertura de contratos cross-service |
| DESIGN | \`data_integrity\` | Validação de data tables |
| IMPLEMENT | \`formula_consistency\` | Validação de fórmulas (game balance) |
| IMPLEMENT | \`performance_budget\` | Status do budget de performance |
| IMPLEMENT | \`state_completeness\` | Validação de state machines |
| VALIDATE | \`scenario_coverage\` | Cobertura de cenários de teste |
| VALIDATE | \`asset_blockers\` | Assets bloqueando tasks |
| VALIDATE | \`config_coverage\` | Cobertura de config schemas |
| VALIDATE | \`metric_coverage\` | Métricas para itens de alto risco |
| VALIDATE | \`concurrency_risk\` | Detecção de race conditions |
| IMPLEMENT | \`economy_simulation\` | Simulação de economia (inflação, gold balance) |
| IMPLEMENT | \`code_sync\` | Verifica sincronização code-graph (design → código real) |
| PLAN | \`smart_decompose\` | Decomposição avançada com sizing e dependency inference |
| PLAN | \`cfd\` | Cumulative Flow Diagram — análise de flow metrics do sprint |
| ANY | \`security_scan\` | Vulnerabilidades (npm audit + secrets grep + Zod boundaries) |
| ANY | \`code_quality\` | Métricas de qualidade (complexity, duplication, naming) |
| ANY | \`test_coverage\` | Cobertura de testes (module→test file mapping) |
| ANY | \`observability_check\` | Verificação de observabilidade (logger, structured logs, error handling) |
| DESIGN | \`adr_challenge\` | Desafia ADRs com alternativas e trade-offs |
| ANY | \`orphan_tasks\` | Detecta tasks órfãs (sem parent, sem edges) |
| ANALYZE | \`prd_lifecycle_health\` | Régua de 9 fases por epic — passedAll boolean + summary (nodeId obrigatório). Persiste snapshot diário (migration v84) |
| PLAN | \`capacity_health\` | Calibração de capacidade vs velocity (±10% tolerância) — sprintLabel via nodeId |
| ANY | \`success_rate\` | Pass-rate rolling sobre os últimos N snapshots de lifecycle_health (\`window\` param, default 10; nodeId escopa para epic) |`

export const KNOWLEDGE_PIPELINE_SECTION = `### Pipeline de Conhecimento (Knowledge Store + RAG)

Fontes indexadas automaticamente:
- **Project memories** — ao escrever com \`write_memory\` (auto-indexa)
- **PRD imports** — ao importar com \`import_prd\`
- **Browser captures** — ao validar com \`validate(action: "task")\`
- **Stack docs** — ao sincronizar com \`sync_stack_docs\`
- **Sprint reports** — ao gerar com \`plan_sprint\`

Recuperação: \`context(action:rag)\` monta contexto phase-aware com budget de tokens:
- 60% contexto do grafo (nodes, deps, status)
- 30% knowledge store (BM25 + TF-IDF)
- 10% metadata de fase

#### Features avançadas do RAG
- **Citation mapping** — cada resultado inclui fonte, snippet e confidence (\`rag/citation-mapper.ts\`)
- **Source contribution** — rastreia quais fontes contribuíram para cada resposta (\`rag/source-contribution.ts\`)
- **Entity indexing** — extração de entidades nomeadas para enriquecer busca (\`rag/entity-indexer.ts\`)
- **RAG trace** — trace completo query→retrieval→ranking→synthesis (\`rag/rag-trace.ts\`)
- **Query understanding** — reescrita e decomposição de queries (\`rag/query-understanding.ts\`)
- **Corrective RAG** — validação pós-retrieval com correção automática (\`rag/post-retrieval.ts\`)
- **ONNX embeddings** — embeddings neurais 384-dim via all-MiniLM-L6-v2 (\`rag/onnx-embeddings.ts\`)

Manual: \`knowledge(action:reindex)\` para rebuild completo do índice.`

export const TEAM_TASK_SECTION = `### Multi-Terminal Orchestrator (teamTask mode)

Permite **2+ agentes Claude** trabalhando em paralelo no mesmo projeto com lock exclusivo por task.

#### Quando usar
- Múltiplos terminais Claude Code abertos no mesmo repositório
- Paralelizar bug fixes, features independentes, ou sprint tasks
- Cada terminal opera como agente independente com ID único

#### Como ativar
\`\`\`
start_task(agentId: "agent-1")    → retorna leaseToken
[implementar com TDD]
finish_task(nodeId: "...", agentId: "agent-1", leaseToken: "<token>")
\`\`\`

#### Semântica de locks
- \`start_task(agentId)\` — **claim exclusivo**: task fica locked para esse agente
- \`next(agentId)\` — exclui tasks locked por outros agentes da sugestão
- \`finish_task(agentId, leaseToken)\` — verifica ownership antes de marcar done
- Tasks locked por agentes inativos são liberadas automaticamente (orphan detection)

#### Sem teamTask mode (default)
Quando \`agentId\` não é fornecido, o fluxo funciona normalmente sem locks — ideal para terminal único.

#### Dashboard
A aba Overview mostra atividade por agente em tempo real via SSE events.`

export const DREAM_MODE_SECTION = `### Dream Mode (Consolidação de Conhecimento)

Motor de consolidação inspirado em ciclos REM do sono. Faz merge, boost e cleanup do knowledge store.

#### Quando usar
- Após importar muitos documentos (PRDs, captures, memories)
- Quando knowledge store tem duplicatas ou dados stale
- Na fase DESIGN para consolidar decisões e padrões

#### Como usar
\`\`\`
dream(action: "start")                    → inicia ciclo completo
dream(action: "start", phases: ["rem"])   → apenas merge de duplicatas
dream(action: "cancel")                   → cancela ciclo em andamento
dream(action: "status")                   → status do ciclo atual
dream(action: "history")                  → histórico de ciclos
\`\`\`

#### Fases do ciclo
1. **NREM** — Cleanup: remove documentos stale, normaliza scores
2. **REM** — Merge: encontra documentos similares via embeddings, faz soft-merge
3. **Boost** — Prioriza: aumenta quality_score de docs com metadata "blocker"/"error"

#### Dashboard
Aba Dream mostra ciclos, métricas antes/depois, e merge clusters.`

export const AGENT_ACTIVITY_SECTION = `### Agent Activity (Monitoramento Multi-Agente)

Rastreia heartbeat e atividade de agentes em teamTask mode via SSE events.

#### Eventos monitorados
- \`agent:heartbeat\` — ping periódico com agentId e task atual
- \`agent:task_claimed\` — agente fez start_task com lock
- \`agent:task_released\` — agente fez finish_task, lock liberado
- \`agent:orphan_detected\` — task locked por agente inativo

#### API
- \`GET /api/v1/agents\` — lista agentes ativos com último heartbeat
- \`GET /api/v1/events\` (SSE) — stream de eventos em tempo real

#### Dashboard
Aba Overview mostra agent activity monitor com status por agente e tasks em andamento.`

export const ADVANCED_TOOLS_SECTION = `### Ferramentas Avançadas

#### Journey Mapping (\`journey\`)
Mapeia fluxos de UI capturados via Playwright. Actions: \`list\`, \`get\`, \`search\`, \`index\`.
- **Screens** — telas capturadas com campos de formulário e CTAs detectados
- **Variants** — A/B test tracking com paths diferentes por variante
- **Form fields** — extração automática de inputs, selects, textareas
- **CTAs** — detecção de call-to-action buttons e links

#### Language Translate (\`translate\`)
Conversão de código entre linguagens. Actions: \`convert\`, \`analyze\`, \`jobs\`, \`batch_convert\`.
- **13 linguagens** — TS, Python, Rust, Go, Java, C/C++, Ruby, PHP, Kotlin, Swift, C#, Lua, Haskell
- **Confidence scoring** — equivalência semântica 0-100 por conversão
- **Batch mode** — converter múltiplos arquivos em paralelo
- **Graph integration** — resultados visualizados no React Flow graph

#### DaVinci Converter (\`davinci\`)
Converte DaVinci JS customizations em PingAccess/PingFederate Java plugins.
Actions: \`analyze\`, \`build\`, \`convert\`, \`batch_convert\`.
- **Plugin types** — custom_function, html_template, css_override
- **Maven scaffold** — gera projeto Maven completo com pom.xml
- **Build** — compila para JAR via Maven (requer JDK + Maven instalados)
- **Variable resolution** — template vars \`{{var}}\` resolvidas automaticamente`

export const OPERATIONAL_TOOLS_SECTION = `### Ferramentas Operacionais

#### Graph Health (\`graph_health\`)
Diagnóstico unificado do grafo. Combina 5 health checks num único scan.
- \`graph_health(action: "scan")\` — roda todos os checks, retorna score 0-100 + issues
- Checks: orphan nodes, circular deps, stale in_progress, missing AC, oversized tasks
- \`graph_health(action: "heal")\` — aplica correções automáticas para issues encontradas

#### Doctor (\`npx mcp-graph doctor\`)
Validação de ambiente (15+ checks): Node.js version, SQLite, MCP servers, git, disk space, migrations, FTS5 index integrity, embedding store, ONNX model, knowledge store.
- \`npx mcp-graph doctor --json\` — output estruturado para automação

#### Snapshot (\`snapshot\`)
Backup/restore completo do grafo. Crítico para HANDOFF e DEPLOY.
- \`snapshot(action: "create")\` — cria snapshot com timestamp + metadata
- \`snapshot(action: "restore", id: "<snapshot_id>")\` — restaura estado completo
- \`snapshot(action: "list")\` — lista snapshots disponíveis
- Recomendado: criar snapshot antes de DEPLOY e ao final de HANDOFF

#### Siebel Integration (\`siebel\`)
8 ações para integração com Siebel CRM via SIF (Siebel Interface Format):
- \`import_sif\` — importa arquivo .sif para o grafo
- \`export_sif\` — exporta objetos do grafo como .sif
- \`validate_sif\` — valida integridade de arquivo SIF
- \`compose_sif\` — compõe SIF a partir de múltiplos objetos
- \`list_objects\` — lista objetos Siebel indexados
- \`get_object\` — detalhes de um objeto específico
- \`search\` — busca full-text em objetos Siebel
- \`templates\` — templates de composição disponíveis

#### Harness Remediation (\`analyze(mode: "harness_remediate")\`)
Engine determinístico de remediação — 16 regras sem AI, produz fix suggestions file-level:
- Analisa cada arquivo contra regras (missing types, empty catches, console.log, etc.)
- Ordena violations por prioridade (impacto no harness score)
- Suppression store para false-positives (\`harness_suppress\`)
- Integrado com \`finish_task\`: se harness regride > 5pts, mostra ruleSuggestions

#### Issue Pattern Tracker (Steering Loop)
\`finish_task\` grava padrões recorrentes de falha DoD. Ao atingir **3 ocorrências** do mesmo padrão, auto-sugere regras em \`.claude/rules/\`.
Padrões rastreados: \`missing_ac\`, \`status_skip\`, \`orphan_node\`, \`circular_dep\`, \`oversized_task\`, \`missing_description\`, \`missing_estimate\`.
O agente recebe \`ruleSuggestions\` no response de \`finish_task\` quando patterns são detectados.`

// ── Harness Engineering ─────────────────────────────────────

export const HARNESS_SECTION = `## Harness Engineering — Agent Readiness Score

### O que é
Métrica composta (0-100) que mede quão preparado o código está para geração/manutenção por agentes AI.
Quanto maior o score, menor o risco de alucinação e retrabalho.

### 8 Dimensões

| Dimensão | Peso | O que mede |
|----------|------|------------|
| Type Coverage | 25% | % arquivos sem \`any\` |
| Test Coverage | 25% | Módulos com arquivo de teste correspondente |
| Architecture Fitness | 15% | Deps direction, circular deps, barrel integrity |
| Docs Coverage | 10% | CLAUDE.md, README, rules/, docs/ |
| Naming Clarity | 10% | Nomes descritivos (sem data/result/temp/val genéricos) |
| Error Handling | 5% | Typed errors, sem catch vazio, sem console.error |
| Context Density | 5% | JSDoc em exports (contexto para agentes) |
| Provenance Coverage | 5% | Proporção de nodes com receipt de origem (source_file) |

### Grades

| Grade | Score | Significado |
|-------|-------|-------------|
| A | >= 85 | Excelente — baixo risco de alucinação |
| B | >= 70 | Bom — deploy permitido |
| C | >= 55 | Razoável — precisa melhorar |
| D | < 55 | Crítico — alto risco de alucinação |

### Comandos

- \`analyze(mode: "harness_scan")\` — Scan completo, salva resultado em knowledge store
- \`analyze(mode: "harness_trend")\` — Evolução do score (últimos 10 snapshots)
- \`analyze(mode: "harness_advice")\` — Sugestões de melhoria por dimensão < 70
- \`analyze(mode: "harness_remediate")\` — Deterministic Remediation Engine: file-level violations → actionable fix suggestions sorted by priority. Zero AI, 16 rules, suppression store for false-positives
- \`npm run harness:scan\` — CLI local (human-readable output)

### Workflow Diário por Fase

| Fase | O que muda com Harness |
|------|------------------------|
| ANALYZE | Rodar harness_scan para baseline inicial |
| DESIGN | Gate: score >= 55 (C) para avançar para PLAN |
| PLAN | Sprint health mostra harness delta; tasks que melhoram dimensões fracas ganham prioridade via harnessBonus |
| IMPLEMENT | start_task mostra harnessWarning se score < 70; finish_task detecta regressão > 5pts e retorna ruleSuggestions |
| VALIDATE | Gate: sem regressão > 10pts |
| REVIEW | Gate: score >= 55 (C) |
| HANDOFF | Gate: score >= 55 (C) recomendado |
| DEPLOY | Gate MAIS RÍGIDO: score >= 70 (B) obrigatório para release |
| LISTENING | Score salvo como baseline pós-deploy para próximo ciclo |

### Security

Security NÃO é dimensão do harness — é quality gate paralelo (\`security_scanner\`).
Harness mede "agent readiness" (tipos, testes, docs). Security mede "code correctness" (vulnerabilidades, secrets).
Ambos são visíveis no lifecycle block de cada tool response.

### Issue Pattern Tracker (Steering Loop)

finish_task grava padrões recorrentes de falha DoD. Ao atingir 3 ocorrências,
auto-sugere regras em \`.claude/rules/\`. Padrões rastreados:
- \`missing_ac\` — Task sem acceptance criteria
- \`status_skip\` — Pulo de status (ex: backlog → done)
- \`orphan_node\` — Node sem parent
- \`circular_dep\` — Dependência circular
- \`oversized_task\` — Task L/XL sem subtasks
- \`missing_description\` — Descrição vazia
- \`missing_estimate\` — Sem xpSize ou estimateMinutes`

/**
 * Get harness engineering reference content.
 */
export function getHarnessReference(): string {
  return HARNESS_SECTION
}

/**
 * Get knowledge pipeline documentation.
 */
export function getKnowledgePipeline(): string {
  return KNOWLEDGE_PIPELINE_SECTION
}

/**
 * §EPIC-E1 / Task E1.9 — provider reference. Lists every supported LLM
 * provider, the routing knobs the gateway exposes for it, and which models
 * carry a tool-call parser hook.
 */
export function getProvidersReference(): string {
  return `## LLM Providers (mcp-graph gateway)

| Provider | Wire format | Adapter | Notes |
|---|---|---|---|
| \`anthropic\` | Anthropic Messages | \`adapters/anthropic.ts\` | Native; cache-control + usage |
| \`openai\` | OpenAI chat.completions | \`adapters/openai.ts\` | Native; SSE streaming |
| \`openrouter\` | OpenAI chat.completions | \`adapters/openrouter.ts\` | Relay; provider routing |
| \`copilot\` | OpenAI-compat | \`adapters/copilot.ts\` | GitHub Copilot bridge |
| \`local-hub\` | OpenAI-compat | \`adapters/local-hub.ts\` | Local model hub (Ollama-like) |
| \`gemini\` | Google generateContent v1beta | \`adapters/gemini.ts\` (E1.5) | Native; role-translated |
| \`bedrock\` | AWS SigV4 → anthropic-on-bedrock | \`adapters/bedrock.ts\` (E1.6) | Hand-rolled SigV4 — no @aws-sdk |
| \`azure\` | OpenAI-wire + deployment URL | \`adapters/azure.ts\` (E1.7) | \`api-key\` header (NOT bearer) |
| \`deepseek\` / \`glm\` / \`kimi\` / \`groq\` | OpenAI-wire | \`adapters/openai-compatible.ts\` + presets (E1.4) | Config-only — DETERMINISTIC FIRST §regra-4 |

### Tool-call parsers (raw-text → structured tool_calls)

For models whose backend emits tool calls as raw text (instead of native function-call JSON):

| Parser id | Markup |
|---|---|
| \`hermes\` | \`<tool_call>{JSON}</tool_call>\` |
| \`deepseek-v3\` | \`<｜tool▁calls▁begin｜>...<｜tool▁call▁end｜>...<｜tool▁calls▁end｜>\` |
| \`glm-4\` | \`<tool_call>name\\n<arg_key>...</arg_key><arg_value>...</arg_value></tool_call>\` |
| \`kimi-k2\` | \`<|tool_calls_section_begin|>...<|tool_call_end|>...<|tool_calls_section_end|>\` |
| \`qwen3-coder\` | \`<tool_call><function=name><parameter=k>v</parameter></function></tool_call>\` |

Declare the parser on a ModelSpec via \`toolCallParserId\` and pass parsers
into \`new LlmGateway({ ..., toolCallParsers: [...] })\`. The agent loop calls
\`gateway.lookupToolCallParser(modelId)\` after a generate() to post-process.

### Failover

- \`failoverChain\` — ordered list tried on retriable errors.
- \`routeWith402Fallback({ chain, attempt })\` (E1.8) — advances on HTTP-402 and
  auth-equivalent errors (401/403); throws \`RouterChainExhaustedError\` when
  every entry has been exhausted.

### Cost & budgets

Every call routes through \`LlmGateway.generate()\` which:
- pre-flights via \`BudgetLedger.guard()\`
- records cost via \`BudgetLedger.record()\` using \`pricing.{input,output}PerMtok\`

Cost is first-class (DETERMINISTIC FIRST §regra-4). No provider call bypasses
the gateway.`
}

/**
 * MCP-as-client reference (E3): how mcp-graph consumes external MCP servers.
 */
export function getMcpClientReference(): string {
  return `## MCP-as-Client (external MCP servers)

mcp-graph is both an MCP **server** (~55 tools) and, since E3, an MCP
**client** — it can consume external stdio / Streamable HTTP MCP servers.

### Configuration

External servers are declared in \`.mcp.json\`:

\`\`\`json
{ "mcpServers": { "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] } } }
\`\`\`

Stdio entries use \`command\` + \`args\`; HTTP entries use \`url\`.

### Tool namespacing

External tools are merged into the tool registry prefixed
\`mcp__<server>__<tool>\` (the claude-code convention). On a name collision the
first-declared server wins; later duplicates are skipped. External tools
carry the \`network\` capability, so the permission enforcer gates them in
no-network modes.

### Sampling

External servers may call back \`sampling/createMessage\` to ask the host for
an inference. \`sampling-handler.ts\` routes the request through
\`LlmGateway.generate()\` — never a provider SDK directly (DETERMINISTIC FIRST
§regra-3). Budget exhaustion returns a structured MCP error, never throws.

### Feature flag

\`MCP_GRAPH_EXTERNAL_MCP_ENABLED\` gates the whole client. It ships **OFF** in
the E3 release; with the flag off, no external server connects and the
registry holds only local tools. In permission-mode \`read-only\`, external
tools are disabled unless explicitly allowlisted via \`--allowedTools\`.

### REPL

\`/mcp <list|add|remove|status>\` manages \`.mcp.json\` and probes live health.

See ADR-0068 (\`docs/_internal/adr/0068-mcp-bidirectional.md\`).`
}

/**
 * Get version reference: which mcp-graph binary the MCP client spawned, plus
 * drift-check guidance. Reuses SERVICE_NAME/SERVICE_VERSION (loaded from
 * package.json at module init in ecs-formatter.ts) so the value is the version
 * compiled into the running binary, not whatever happens to be on disk.
 */
export function getVersionReference(): string {
  return `## mcp-graph — Versão em execução

| Campo | Valor |
|-------|-------|
| Pacote | \`${SERVICE_NAME}\` |
| Versão | \`${SERVICE_VERSION}\` |

> Esta é a versão **compilada no binário** que o cliente MCP spawnou. Se você atualizou o pacote globalmente após o cliente iniciar, este valor continua o antigo até reiniciar o cliente.

### Verificar drift contra o npm

\`\`\`bash
mcp-graph --version                                    # versão do binário global
npm view ${SERVICE_NAME} version                       # última publicada no registry
npm outdated -g ${SERVICE_NAME}                        # current / wanted / latest lado a lado
\`\`\`

### Atualizar

\`\`\`bash
npm i -g ${SERVICE_NAME}@latest
\`\`\`

Depois do upgrade, **reinicie o cliente MCP** (Claude Code, Cursor, etc.) — o servidor MCP é processo filho do cliente; o binário antigo continua em memória até o respawn.`
}
