/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Skills, lifecycle, and quality reference content — built-in skills, phase gates, DoD, DOR, flow principles, TDD enforcement.
 * WHY here: groups skills and quality lifecycle documentation distinct from tools and deprecated content.
 * Composing modules: re-exported via reference-content.ts barrel.
 */

export const SKILLS_SECTION = `### Skills Built-in (54 skills)

54 skills mapeadas às fases do lifecycle. Use \`list_skills\` para descobrir por fase ou ver instruções completas.

#### Skills por fase

| Fase | Skills sugeridas |
|------|-----------------|
| ANALYZE | \`create-prd-chat-mode\`, \`business-analyst\`, \`product-manager\` |
| DESIGN | \`breakdown-epic-arch\`, \`context-architect\`, \`backend-architect\` |
| PLAN | \`breakdown-feature-prd\`, \`track-with-mcp-graph\` |
| IMPLEMENT | \`subagent-driven-development\`, \`xp-bootstrap\`, \`self-healing-awareness\` |
| VALIDATE | \`playwright-explore-website\`, \`playwright-generate-test\`, \`e2e-testing\` |
| REVIEW | \`code-reviewer\`, \`code-review-checklist\`, \`review-and-refactor\`, \`observability-engineer\` |
| DEPLOY | \`deployment-engineer\`, \`devops-deploy\`, \`git-pushing\` |
| HANDOFF | \`delivery-checklist\`, \`pr-documentation\`, \`knowledge-capture\` |
| LISTENING | \`feedback-collector\`, \`iteration-planner\`, \`metrics-retrospective\` |

#### Categorias adicionais (multi-fase)

| Categoria | Skills |
|-----------|--------|
| software-design | SOLID, KISS, YAGNI, DRY, clean-architecture, composition-over-inheritance |
| security | \`owasp-web-security\`, \`auth-and-secrets\`, \`database-and-deps-security\` |
| ddd | \`domain-driven-design\` (DESIGN, PLAN) |
| testing | \`comprehensive-testing-reference\`, \`self-healing-awareness\` (IMPLEMENT, VALIDATE) |
| cost-reducer | \`cloud-infra-cost\`, \`code-level-savings\`, \`finops-services\` (DESIGN, REVIEW) |
| frontend-design | \`ui-ux-patterns\` (DESIGN, IMPLEMENT) |

#### Custom Skills

Crie skills específicas do projeto via \`manage_skill\` (create/enable/disable). Custom skills são armazenadas no grafo e aparecem junto com as built-in em \`list_skills\`.

#### Self-Healing Awareness

A skill \`self-healing-awareness\` monitora padrões de erro recorrentes e sugere correções automaticamente. Ativa nas fases IMPLEMENT e VALIDATE.`

export const PHASE_GATES_SECTION = `### Phase Gates (Transições entre Fases)

Antes de mudar de fase, rodar o analyze mode correspondente:

| De → Para | Gate (analyze mode) | Pré-requisitos |
|-----------|---------------------|----------------|
| ANALYZE → DESIGN | — | ≥1 epic/requirement no grafo |
| DESIGN → PLAN | \`design_ready\` | ADRs, interfaces, coupling + harness ≥ 55 |
| PLAN → IMPLEMENT | — | \`sync_stack_docs\` + \`plan_sprint\` executados |
| IMPLEMENT → VALIDATE | \`validate_ready\` | ≥50% tasks done com AC testável |
| VALIDATE → REVIEW | \`done_integrity\` + \`status_flow\` | Todos checks passam |
| REVIEW → HANDOFF | \`review_ready\` | Export + blast radius ok |
| HANDOFF → DEPLOY | \`handoff_ready\` + \`doc_completeness\` | Snapshot + memories salvos |
| DEPLOY → LISTENING | \`deploy_ready\` + \`release_check\` | Release validado + harness ≥ 70 |`

export const DOD_SECTION = `### Definition of Done (8 Checks)

Rodar \`analyze(mode: "implement_done", nodeId)\` antes de \`update_status(done)\`:

| # | Check | Severidade | O que verifica |
|---|-------|------------|----------------|
| 1 | \`has_acceptance_criteria\` | **required** | Task ou parent tem AC |
| 2 | \`ac_quality_pass\` | **required** | Score AC ≥ 60 (INVEST) |
| 3 | \`no_unresolved_blockers\` | **required** | Nenhum \`depends_on\` para node não-done |
| 4 | \`status_flow_valid\` | **required** | Passou por \`in_progress\` antes de \`done\` |
| 5 | \`has_description\` | recomendado | Descrição não-vazia |
| 6 | \`not_oversized\` | recomendado | Sem L/XL sem subtasks |
| 7 | \`has_testable_ac\` | recomendado | ≥1 AC testável |
| 8 | \`has_test_files\` | recomendado | testFiles preenchido |`

export const TOOL_PREREQUISITES_SECTION = `### Tool Prerequisites (Modo Strict)

Em \`strict\`, ações são bloqueadas se pré-requisitos não foram executados:

| Trigger | Pré-requisitos obrigatórios | Escopo |
|---------|----------------------------|--------|
| \`set_phase(PLAN)\` | \`analyze(design_ready)\` | projeto |
| \`set_phase(IMPLEMENT)\` | \`sync_stack_docs\` + \`plan_sprint\` | projeto |
| \`update_status(in_progress)\` | \`next\` | projeto |
| \`update_status(done)\` IMPLEMENT | \`context(compact)\` + \`context(rag)\` + \`analyze(implement_done)\` | por node |
| \`update_status(done)\` VALIDATE | \`validate\` + \`analyze(validate_ready)\` | misto |
| \`set_phase(HANDOFF)\` | \`analyze(review_ready)\` + \`export\` | projeto |
| \`set_phase(LISTENING)\` | \`analyze(handoff_ready)\` + \`snapshot\` + \`write_memory\` | projeto |`

export const WORKFLOWS_SECTION = `### Workflows Compostos (Combinações Poderosas)

**PRD → Sprint Ready:**
\`import_prd → analyze(prd_quality, scope, risk) → plan_sprint → sync_stack_docs\`

**Implementação com Contexto Completo:**
\`next → context(compact) → context(rag, detail=deep) → code_intelligence(impact) → [TDD] → analyze(implement_done) → update_status(done)\`

**Validação E2E:**
\`validate(task, Playwright A/B) → analyze(done_integrity, status_flow) → export(mermaid)\`

**Self-Healing (prevenir erros recorrentes):**
\`context(action:rag, query="erro similar") → write_memory(padrão encontrado) → next\`

**Snapshot & Rollback:**
\`snapshot(create) antes de mudanças arriscadas → [implementar] → snapshot(restore) se falhar\``

export const AGENT_ANTIPATTERNS_SECTION = `### Erros Comuns de Agentes

| Erro | Correto |
|------|---------|
| Usar \`export()\` para contexto de task | Usar \`context()\` (73% menos tokens) |
| Marcar done sem rodar \`analyze(implement_done)\` | Sempre rodar DoD check antes |
| Implementar sem chamar \`next\` | \`next\` dá prioridade + TDD hints + deps check |
| Confiar em memories para estado atual | Grep no código — memories ficam stale |
| Pular \`context(action:rag)\` em IMPLEMENT | RAG traz decisões de DESIGN + healing memories |
| Criar tasks sem AC | AC é required — \`validate(ac)\` bloqueia sem ela |
| Ignorar Code Intelligence em REVIEW | \`code_intelligence(impact)\` mostra blast radius |
| Usar 6 calls separados (next+context+rag+...) | Usar \`start_task\` + \`finish_task\` (pipeline v8.0) |
| Ignorar \`_lifecycle.nextAction\` na resposta | Seguir o nextAction — o grafo sabe o que fazer |`

export const FLOW_PRINCIPLES_SECTION = `### Princípios de Fluxo (Little's Law + Lean + TOC)

**WIP = 1** — Um agente deve ter no máximo 1 task \`in_progress\` de cada vez.
Lei de Little: \`cycle_time = WIP / throughput\`. Reduzir WIP reduz cycle time sem perder throughput.

**Pull, não Push** — Usar \`next\` para puxar a próxima task (pull system).
Nunca empurrar tasks para \`in_progress\` sem terminar a anterior.

**Gargalo primeiro (Theory of Constraints)** — Se VALIDATE tem tasks acumuladas,
parar de implementar e validar. Otimizar o gargalo, não produzir mais WIP.

**Eliminar desperdício (Lean/Toyota):**
- Overproduction: não implementar features não planejadas
- Waiting: não deixar tasks blocked sem ação
- Overprocessing: usar \`context()\` (73% menos tokens) em vez de \`export()\`
- Defects: TDD Red→Green→Refactor elimina retrabalho

**Métricas de fluxo (usar com \`metrics\` e \`analyze(progress)\`):**
- Cycle time = \`done_timestamp - in_progress_timestamp\` por task
- Lead time = \`done_timestamp - created_at\` por task
- Throughput = tasks done / dias
- Flow efficiency = tempo ativo / lead time total (target > 40%)`

export const QUALITY_METRICS_SECTION = `### Métricas de Qualidade (Six Sigma + DORA + Shift-Left)

**First-Pass Yield (Six Sigma):**
Tasks marcadas done que NÃO precisaram de rework (status revertido). Target: > 95%.
Se first_pass_yield cai, rodar \`analyze(tdd_check)\` mais rigoroso.

**DORA Metrics (4 indicadores de delivery health):**
1. **Deployment Frequency** = nodes \`done\` por dia
2. **Lead Time** = \`done_timestamp - created_at\` (target P85 < 1 dia para tasks atômicas)
3. **Change Failure Rate** = tasks revertidas / total done (target < 10%)
4. **MTTR** = tempo de rework-detectado até rework-resolvido (target < 2h)

**Shift-Left Testing (custo de defeitos por fase):**
| Fase onde bug é encontrado | Custo relativo |
|---------------------------|----------------|
| DESIGN | 1x |
| PLAN | 3x |
| IMPLEMENT | 10x |
| VALIDATE | 25x |
| DEPLOY/produção | 100x |

Implicação: validar schemas em DESIGN, test stubs em PLAN, TDD em IMPLEMENT. Nunca descobrir bugs em DEPLOY.`

export const DOR_SECTION = `### Definition of Ready (7 Checks — Gate ANALYZE → DESIGN)

Rodar \`analyze(mode: "ready")\` antes de avançar para DESIGN:

| # | Check | O que verifica |
|---|-------|----------------|
| 1 | \`has_requirements\` | ≥1 epic ou requirement no grafo |
| 2 | \`has_acceptance_criteria\` | Tasks ou AC nodes existem |
| 3 | \`no_orphans\` | Sem requirements ou tasks órfãos |
| 4 | \`no_cycles\` | Sem ciclos de dependência |
| 5 | \`has_constraints\` | ≥1 constraint node |
| 6 | \`has_risks\` | ≥1 risk node |
| 7 | \`prd_quality_score\` | Score PRD ≥ 60 |`

export const TDD_ENFORCEMENT_SECTION = `### TDD Enforcement (Testabilidade por AC)

O \`next\` retorna \`tddHints\` — specs de teste inferidos dos AC:

**Inferência de tipo de teste por keywords:**
- **Unit**: "retorna", "returns", "valida", "calculates", "parse"
- **Integration**: "persiste", "database", "sync", "saves", "indexa"
- **E2E**: "navega", "page", "form", "clicks", "browser"

**Métricas TDD (via \`analyze(tdd_check)\`):**
- \`testabilityScore\` — % de AC que são testáveis (target: 100%)
- \`tasksAtRisk\` — tasks com testability = 0%
- \`suggestedSpecs\` — specs sugeridos por AC (nome + tipo + setup)

**Regra:** Se \`testabilityScore < 80%\`, reescrever AC antes de implementar.`

/**
 * Get phase gates documentation.
 */
export function getPhaseGates(): string {
  return PHASE_GATES_SECTION
}

/**
 * Get Definition of Done checks.
 */
export function getDefinitionOfDone(): string {
  return DOD_SECTION
}

/**
 * Get tool prerequisites documentation.
 */
export function getToolPrerequisites(): string {
  return TOOL_PREREQUISITES_SECTION
}

/**
 * Get composite workflows documentation.
 */
export function getWorkflows(): string {
  return WORKFLOWS_SECTION
}

/**
 * Get agent antipatterns documentation.
 */
export function getAgentAntipatterns(): string {
  return AGENT_ANTIPATTERNS_SECTION
}

/**
 * Get flow principles documentation.
 */
export function getFlowPrinciples(): string {
  return FLOW_PRINCIPLES_SECTION
}

/**
 * Get quality metrics documentation.
 */
export function getQualityMetrics(): string {
  return QUALITY_METRICS_SECTION
}

/**
 * Get Definition of Ready checks.
 */
export function getDefinitionOfReady(): string {
  return DOR_SECTION
}

/**
 * Get TDD enforcement documentation.
 */
export function getTddEnforcement(): string {
  return TDD_ENFORCEMENT_SECTION
}
