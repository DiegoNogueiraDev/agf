# agent-graph-flow v0.15.0 — Release PRD

## 5W2H

- **What:** Release v0.15.0 focada em fluxo, qualidade e prova de economia. Não é construir features novas — é encerrar, medir e estabilizar.
- **Why:** O projeto está em BUILD com WIP=23 (violação de Little's Law), DORA trend "declining", test coverage 37%, e token savings = $0. A v0.15.0 prova que o agente entrega software de qualidade com custo medido e previsível.
- **Who:** Diego (solo dev) + executor agente (IMPLEMENT).
- **Where:** Local-first, Node ≥20, CLI `agf` + TUI Ink.
- **When:** 1 sprint (~2 semanas), release sem npm publish.
- **How:** WIP=1, TDD obrigatório, `agf check` antes de `agf done`, eval com baseline.
- **How much:** 5 epics, ~15 tasks, estimável via `agf forecast`.

## Jobs To Be Done (JTBD)

- Quando afirmo "custo brutalmente baixo", quero **provar com número real** (baseline, $/sucesso, fator 2-4x).
- Quando o projeto acumula 23 tasks in_progress, quero **WIP=1 com gate automático** que impeça WIP>1.
- Quando o harness é 74.5 (B), quero **elevar para 80+ (A-)** com foco em test coverage e error handling.
- Quando o DORA trend é "declining", quero **reverter para "improving"** reduzindo lead time e aumentando throughput.
- Quando há 47 nodes sem AC, quero **cobertura 100% de AC** nos novos épicos e tasks da v0.15.0.

## MoSCoW

### Must Have (MVP — v0.15.0 core)

1. **WIP Gate Automático** — `agf start` bloqueia se WIP ≥ 1; `agf next` é o único caminho para in_progress.
2. **Test Coverage 37% → 60%** — Preencher testes para módulos críticos (core/store, core/llm, core/harness, core/insights).
3. **Token Economy Baseline** — `agf eval --live` com 3 modelos × 3 cenários × 3 repeats = 27 runs. Scorecard com 95% CI.
4. **DoD Enforcement** — `agf check <id>` obrigatório antes de `agf done`. 47 nodes sem AC devem ser atualizados ou movidos.
5. **Reconciliação de Grafo** — 23 tasks in_progress movidas para backlog; nenhuma task fica "feita mas não fechada".

### Should Have

6. **Error Handling 0% → 80%** — Substituir 31 raw throws por `McpGraphError` tipado; eliminar `console.log`/`console.warn` em favor de logger.
7. **DORA Trend Alert** — `agf insights` alerta quando trend = "declining" por 2 sprints consecutivos.
8. **Harness Trend Tracking** — `agf harness` persiste histórico e `agf insights` mostra predição de grade target.

### Could Have

9. **agf quality --fix** — Auto-sugere e aplica correções (add log, add test stub) com preview.
10. **Cache Hit Rate Tracking** — `agf metrics` mostra hit rate por categoria (graph_read, code_intel, knowledge).

### Won't Have (agora)

11. npm publish (v1.0.0)
12. Dashboard web React / API REST
13. Eval de TUI via CDP / MCP server externo / LSP
14. Novos comandos do roadmap de 260 (fica para v0.16+)

## Gherkin Scenarios

```gherkin
Feature: WIP Gate
  Scenario: agf start bloqueia quando WIP >= 1
    Given a project with 1 task in_progress
    When the agent runs "agf start"
    Then the command should return error code "WIP_EXCEEDED"
    And suggest "agf done <id> or agf node status <id> backlog"

Feature: Test Coverage
  Scenario: agf harness reporta >= 60% test coverage
    Given the project source code
    When the agent runs "agf harness"
    Then the test coverage score should be >= 60
    And the error handling score should be >= 80

Feature: Token Economy Baseline
  Scenario: agf eval produz scorecard com 95% CI
    Given the eval suite with 3 scenarios
    When the agent runs "agf eval --live --repeat 3"
    Then the output should contain 27 runs
    And the scorecard should report confidence intervals
    And the baseline cost per success should be documented

Feature: DoD Enforcement
  Scenario: agf done bloqueia sem AC
    Given a task without acceptance criteria
    When the agent runs "agf done <id>"
    Then the command should return error code "DOD_FAILED"
    And the check should report "missing acceptance criteria"
```

## Riscos

- **Risco: WIP=1 é muito restritivo para solo dev.** Mitigação: WIP=1 é a regra; exceção explícita via `agf node status <id> in_progress --force` com justificativa no node description.
- **Risco: elevar test coverage de 37% para 60% exige ~300 novos testes.** Mitigação: focar nos 20% de módulos críticos (core/store, core/llm, core/harness) que representam 80% do blast radius. Usar `agf quality --fix` para auto-gerar stubs.
- **Risco: eval --live requer provider autenticado.** Mitigação: usar OpenRouter com `export OPENROUTER_API_KEY` ou Ollama local. Ollama é zero custo e zero rede.
- **Risco: agf check falhar para 47 nodes sem AC.** Mitigação: aplicar `agf node update --ac` em batch para os 20% mais críticos; mover o resto para backlog com flag `needs_ac`.

## Restrições

- Não-regressão: `build` + `typecheck` + `test` + `lint` verdes a cada incremento.
- Backward-compatible: zero breaking changes na API MCP.
- Padrões do repo: ESM, Zod v4, strict TS sem `any`, typed errors, logger.
- TDD obrigatório: teste antes do código. Sem teste = sem implementação.
- WIP=1: apenas 1 task in_progress por vez. Exceção apenas com `--force` documentado.

## Acceptance Criteria (por Epic)

### Epic 1: WIP Control & Flow Discipline

- [ ] `agf start` retorna erro quando WIP ≥ 1
- [ ] `agf next` é o único caminho válido para in_progress
- [ ] `agf insights` mostra WIP real e alerta quando > 1
- [ ] Zero tasks in_progress fantasmas (toda in_progress tem código ativo nas últimas 24h)

### Epic 2: Test Coverage & Shift-Left

- [ ] Test coverage ≥ 60% (harness score)
- [ ] Error handling ≥ 80% (harness score)
- [ ] `npm run test:blast` passa para tasks core da v0.15.0
- [ ] `ci:smoke` verde após cada incremento

### Epic 3: Token Economy Proof

- [ ] `agf eval --live --repeat 3` completa 27 runs
- [ ] Scorecard com 95% CI salvo em `evals/results/benchmark-v015.md`
- [ ] Baseline de custo por sucesso documentado
- [ ] `agf metrics --baseline` funciona end-to-end

### Epic 4: Graph Integrity & DoD

- [ ] 47 nodes sem AC atualizados com AC ou movidos para backlog
- [ ] `agf check <id>` passa para 100% dos novos tasks da v0.15.0
- [ ] Zero épicos "feito mas não fechado" no grafo
- [ ] `agf snapshot create` antes de movimentações em massa

### Epic 5: DORA & Forecasting

- [ ] DORA trend = "improving" após 1 sprint de WIP=1
- [ ] Lead time p50 < 48h (de 129.6h para < 48h)
- [ ] `agf forecast` prediz ETA do backlog com 95% CI
- [ ] `agf insights` alerta em trend "declining" por 2 sprints

## Roadmap para v0.16.0 (não incluído)

- 260 novos comandos agf CLI (épicos já existentes no backlog)
- TUI production-grade (EP-6 do v0.14)
- Eval framework product-relevant (M4, C1-C4, S2-S4)
- MCP server external eval

---

**Versão:** 0.15.0
**Data:** 2026-06-16
**Autor:** graph-lead (Claude reasoning role)
**Fase:** ANALYZE → DESIGN → PLAN → IMPLEMENT (delegate) → VALIDATE → REVIEW → HANDOFF
