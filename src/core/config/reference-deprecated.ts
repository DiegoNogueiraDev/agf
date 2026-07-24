/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deprecated reference content — MCP legacy sections maintained for backward compatibility.
 * WHY here: grouped by "deprecated" lifecycle so non-legacy tools stay in separate modules.
 * Composing modules: re-exported via reference-content.ts barrel.
 */

export const TOOL_TABLE_FULL = `> **DEPRECATED — MCP LEGACY:** Esta seção documenta ferramentas MCP legadas (v8.0). O agent-graph-flow atual opera **100% via CLI \`agf\` — zero MCP**. Use \`agf <comando>\` em vez de \`mcp__*\` tools. Esta seção é mantida para backward compatibility apenas.

### Ferramentas MCP disponíveis (40 tools — v8.0 consolidated + spec-kit)

#### Pipeline Tools (v8.0 — recommended)

| Tool | Quando usar |
|------|-------------|
| \`start_task\` | Iniciar próxima task em 1 call (compõe next + context + TDD hints + update_status). Substitui 5 calls separados. |
| \`finish_task\` | Finalizar task com validação em 1 call (compõe DoD 9 checks + AC + update_status + epic promotion + next). Substitui 3 calls separados. |

#### Projeto & Grafo

| Tool | Quando usar |
|------|-------------|
| \`init\` | Inicializar grafo do projeto (cria DB, AI memory files, detecta MCPs) |
| \`list\` | Listar nodes do grafo (filtrar por tipo/status/parent) |
| \`show\` | Ver detalhes de um node específico (metadata, deps, knowledge) |
| \`search\` | Busca full-text no grafo (FTS5 + BM25 ranking) |
| \`export\` | Exportar grafo (JSON completo ou Mermaid diagram) |
| \`snapshot\` | Criar/restaurar snapshots do grafo (backup/rollback) |
| \`metrics\` | Estatísticas do grafo (\`stats\`) ou velocidade por sprint (\`velocity\`) |

#### Nodes & Edges

| Tool | Quando usar |
|------|-------------|
| \`node\` | CRUD de nodes: action \`add\` (criar), \`update\` (atualizar), \`delete\` (remover) |
| \`move_node\` | Mover node para outro parent |
| \`clone_node\` | Clonar node com filhos (deep copy) |
| \`edge\` | Criar/remover relações entre nodes (depends_on, blocks, related_to) |
| \`update_status\` | Mudar status de um node (backlog→ready→in_progress→done) |
| \`bulk_update_status\` | Atualizar status de múltiplos nodes de uma vez |

#### PRD & Planejamento

| Tool | Quando usar |
|------|-------------|
| \`import_prd\` | Importar PRD → segmentar → classificar → extrair → inferir deps → criar grafo + indexar knowledge |
| \`plan_sprint\` | Gerar relatório de planejamento de sprint (capacity, velocity, recomendações) |
| \`analyze\` | 24 modos de análise por fase do lifecycle (ver modos abaixo) |
| \`set_phase\` | Forçar/resetar fase do lifecycle (strict/advisory, gate checks) + Code Intelligence mode (strict/advisory/off) + Tool Prerequisites mode (strict/advisory/off) |

#### Contexto & RAG

| Tool | Quando usar |
|------|-------------|
| \`next\` | Próxima task recomendada (prioridade + deps + knowledge coverage 0-1 + TDD hints + velocity) |
| \`context\` | Contexto consolidado: action \`compact\` (task context ~73% redução), \`rag\` (RAG phase-aware, tiers: summary/standard/deep), \`compress\` (compressão de texto), \`batch_compress\` (compressão em lote) |
| \`sync_stack_docs\` | Sincronizar docs das libs do projeto via Context7 |

#### Memórias do Projeto

| Tool | Quando usar |
|------|-------------|
| \`write_memory\` | Escrever memória em workflow-graph/memories/{name}.md (auto-indexa no RAG) |
| \`read_memory\` | Ler conteúdo de uma memória específica |
| \`list_memories\` | Listar todas as memórias disponíveis |
| \`delete_memory\` | Remover memória do filesystem e do knowledge store |

#### Validação

| Tool | Quando usar |
|------|-------------|
| \`validate\` | Validação: action \`task\` (browser A/B com Playwright) ou \`ac\` (critérios de aceitação) |

#### Skills

| Tool | Quando usar |
|------|-------------|
| \`manage_skill\` | Gerenciar skills: action \`list\` (listar/filtrar por fase), \`enable\`/\`disable\`, CRUD de custom skills |

#### Utilitários

| Tool | Quando usar |
|------|-------------|
| \`help\` | Referência on-demand de tools, analyze modes, skills, CLI, workflow (este tool) |
| \`journey\` | Gerenciar journey maps de websites (list, get, search, index para RAG) |
| \`import_graph\` | Importar/merge grafo JSON exportado (local wins, dry_run disponível) |

#### Spec-Driven Development (spec-kit v8)

| Tool | Quando usar |
|------|-------------|
| \`constitution\` | Gerenciar princípios governantes: create, update, list, check (valida nodes contra princípios) |
| \`plugin\` | Gerenciar extensões: install, remove, enable, disable, list, info |
| \`preset\` | Gerenciar presets de workflow: list, apply, show, create (default, strict-tdd, agile-light, enterprise) |
| \`spec\` | Templates de spec: generate (markdown), validate (contra template), list_templates |
| \`spec_sync\` | Evolução de specs: sync (bidirecional), status, history, link (spec ↔ nodes) |
| \`agent_format\` | Gerar instruções para AI agents: generate, list_formats, list_agents (markdown, TOML, skill.md, JSON) |

#### Code Intelligence (LSP)

| Tool | Quando usar |
|------|-------------|
| \`code_intelligence\` | Análise semântica via LSP (15 modos): \`definition\`, \`references\`, \`hover\`, \`rename\`, \`apply_rename\`, \`call_hierarchy_in\`, \`call_hierarchy_out\`, \`diagnostics\`, \`document_symbols\`, \`workspace_symbols\`, \`languages\`, \`status\`, \`format_document\`, \`code_actions\`, \`apply_code_action\`. Multi-language: TS, Python, Rust, Go, Java, C/C++, Ruby, PHP, Kotlin, Swift, C#, Lua |

#### Knowledge (consolidated v8.0)

| Tool | Quando usar |
|------|-------------|
| \`knowledge\` | Knowledge store consolidado: action \`stats\` (estatísticas), \`export\` (export/import/preview packages), \`feedback\` (helpful/unhelpful/outdated), \`prune\` (limpeza), \`reindex\` (rebuild FTS), \`batch_feedback\` (feedback em lote) |

#### Siebel CRM (consolidated v8.0)

| Tool | Quando usar |
|------|-------------|
| \`siebel\` | Siebel CRM consolidado: action \`import_sif\` (importar .SIF), \`analyze\` (impact/dependencies/circular), \`compose\` (Composer via Playwright), \`env\` (ambientes), \`validate\` (validação SIF), \`search\` (busca objetos), \`generate\` (gerar SIF), \`import_docs\` (importar docs), \`batch_import_sif\` (import em lote) |

#### DaVinci (consolidated v8.0)

| Tool | Quando usar |
|------|-------------|
| \`davinci\` | DaVinci converter consolidado: action \`analyze\` (JS AST analysis), \`build\` (build output), \`convert\` (code conversion), \`batch_convert\` (conversão em lote) |

#### Translation (consolidated v8.0)

| Tool | Quando usar |
|------|-------------|
| \`translate\` | Tradução de código: action \`convert\` (traduzir entre linguagens), \`analyze\` (prontidão), \`jobs\` (gerenciar jobs), \`batch_convert\` (traduzir múltiplos) |`

export const DEPRECATED_TOOLS_SECTION = `#### Tools Deprecated (backward compat, removidos na v7.0)

| Tool antigo | Usar no lugar |
|-------------|---------------|
| \`add_node\` | \`node\` com action:\`add\` |
| \`update_node\` | \`node\` com action:\`update\` |
| \`delete_node\` | \`node\` com action:\`delete\` |
| \`validate_task\` | \`validate\` com action:\`task\` |
| \`validate_ac\` | \`validate\` com action:\`ac\` |
| \`list_skills\` | \`manage_skill\` com action:\`list\` |`

export const PIPELINE_TOOLS_SECTION = `> **DEPRECATED — MCP LEGACY:** Pipeline tools v8.0 usavam \`start_task\`/\`finish_task\` via MCP. O agent-graph-flow atual usa \`agf start\`/\`agf done\` via CLI. Mantido para backward compatibility.

### Pipeline Tools v8.0 (Agent Autopilot)

**Fluxo v8.0 (recomendado — 2 calls):**
\`\`\`
start_task → [implementar com TDD] → finish_task
\`\`\`

**Fluxo v5.x (granular — 6 calls, ainda disponível):**
\`\`\`
next → context(compact) → context(rag) → [implementar com TDD] → analyze(implement_done) → update_status
\`\`\`

#### start_task
Compõe: \`next\` + \`context(compact)\` + \`context(rag)\` + TDD hints + \`update_status(in_progress)\`
- \`nodeId?\` — task específica ou auto via next
- \`contextDetail?\` — "summary" | "standard" | "deep" (default: standard)
- \`ragBudget?\` — token budget para RAG (default: 4000)
- \`autoStart?\` — marca in_progress automaticamente (default: true)
- \`agentId?\` — ID do agente para teamTask mode (lock exclusivo)
Retorna: task + context + ragContext + tddHints + startedAt (+ leaseToken em teamTask mode)

#### finish_task
Compõe: DoD (9 checks) + AC validation + \`update_status(done)\` + epic promotion + next
- \`nodeId\` — task ID (obrigatório)
- \`rationale?\` — decisão técnica (indexada como AI decision para RAG futuro)
- \`testFiles?\` — arquivos de teste associados
- \`autoNext?\` — retorna próxima task recomendada (default: true)
- \`agentId?\` — ID do agente (verifica ownership em teamTask mode)
- \`leaseToken?\` — token do start_task (libera o lock)
Retorna: dodReport + status (done|blocked) + blockers + epicPromotion + nextTask

#### Agent State Machine (nextAction)
Toda resposta de tool inclui \`_lifecycle.nextAction\` com a próxima ação recomendada:
- \`tool\` — qual tool chamar
- \`args?\` — argumentos sugeridos
- \`reason\` — por que essa ação
- \`priority\` — "required" | "recommended" | "optional"
- \`hint?\` — dica contextual (ex: "Write test for AC #1 first")

O agente segue o \`nextAction\` — o grafo dirige o workflow, não o agente.`

export const CLI_COMMANDS = `> **DEPRECATED — CLI LEGADO:** \`npx mcp-graph\` foi substituído por \`agf\` (agent-graph-flow). Use \`agf <comando>\` em vez de \`npx mcp-graph <comando>\`.

### Comandos essenciais

\`\`\`bash
npx mcp-graph init             # Inicializar mcp-graph no projeto (CLAUDE.md, .mcp.json, gitignore)
npx mcp-graph update           # Atualizar configs para última versão
npx mcp-graph import <file>    # Importar PRD (.md, .txt, .pdf, .html) diretamente no grafo
npx mcp-graph index            # Reindexar knowledge store, rebuild embeddings, refresh docs cache
npx mcp-graph stats            # Estatísticas do grafo
npx mcp-graph list             # Listar nodes
npx mcp-graph doctor           # Validar ambiente de execução
npx mcp-graph doctor --json    # Diagnóstico em JSON estruturado
npx mcp-graph serve --port 3000  # Dashboard visual
\`\`\``

/**
 * Get CLI commands reference.
 */
export function getCliCommands(): string {
  return CLI_COMMANDS
}

/**
 * Get pipeline tools documentation.
 */
export function getPipelineTools(): string {
  return PIPELINE_TOOLS_SECTION
}
