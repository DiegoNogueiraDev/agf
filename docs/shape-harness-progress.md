# SHAPE Completeness & Precision Harness — Progresso & Tasks

> Documento de continuação. Plano completo aprovado em
> `~/.claude/plans/concurrent-sprouting-rainbow.md`. Este doc rastreia o que já foi
> feito e o que falta, para retomarmos de onde paramos.

## Tese (relembrar)

Tornar o agf **especialista em entregar projetos complexos de forma ultra-completa
usando pouco token**. O motor de SHAPE é 100% determinístico (~0 token) mas raso.
Solução: cada lacuna segue o loop **DETECT (determinístico, ~0 token) → DELEGATE
(enrichment request CLI-agnóstico que QUALQUER driver — Copilot/Claude/OpenCode/
Cursor/Gemini — executa via comandos `agf`) → VERIFY (gate determinístico)**. O agf
não gasta tokens próprios; a IA condutora (já no loop) preenche a semântica com
margem para escolher, e o gate força o desfecho a ser determinístico.

## Status por milestone

| M       | Título                                           | Status           | Notas                                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0**  | Protocolo `core/gaps/` (scaffold)                | ✅ **Done**      | `gap-types.ts`, `index.ts` (registry), `gaps-cmd.ts`, `GapVerificationError`, comando `agf gaps` registrado. 7 testes.                                                                                                                                                                               |
| **M1**  | Traceability requirement→task→test               | ✅ **Done**      | `buildFullChainTraceability`, `detect-traceability.ts`, check `recommended` no design gate. 14 testes (inclui closure).                                                                                                                                                                              |
| **—**   | Regressão skills-lifecycle                       | ✅ **Resolvida** | Skills curadas restauradas de `bf2acf1` + agora vivem como SOURCE em `skills-graph/`; `adaptCodexSkillContent` virou passthrough (preserva `trigger: /graph-X`, sem flip `$graph-`); `buildCodexSkill` (fallback) emite `## Steps`. Regeneração idempotente (não re-degrada). 83 testes de skill ✅. |
| **M2**  | Cobertura de AC na decomposição                  | ✅ **Done**      | `core/planner/ac-coverage.ts` (token-overlap ≥60%, tolera rephrasing) + `detect-ac-coverage.ts`. 9 testes.                                                                                                                                                                                           |
| **M3**  | Rigor de testabilidade de AC                     | ✅ **Done**      | `core/analyzer/ac-testability.ts` (exige verbo de ação, ignora modais `should`/`must`) + `detect-weak-ac.ts`. 7 testes.                                                                                                                                                                              |
| **M6**  | Gate de ambiguidade / weasel-words               | ✅ **Done**      | `VAGUE_TERMS` extraído p/ `core/analyzer/vague-terms.ts` (ac-validator reusa) + `ambiguity-gate.ts` (whole-word, SPECIFIED/PARTIALLY/UNSPECIFIED) + `detect-ambiguity.ts`. 8 testes.                                                                                                                 |
| **M7**  | Verificador de atomicidade                       | ✅ **Done**      | `core/planner/atomicity.ts` (reusa `detectLargeTasks`) + `detect-atomicity.ts`. 7 testes.                                                                                                                                                                                                            |
| **—**   | **Smoke ao vivo**                                | ✅               | `agf gaps` roda os 6 detectores no `graph.db` real e emite enrichment requests acionáveis (score/grade/ready). Loop detect→delegate→verify provado E2E.                                                                                                                                              |
| **M4**  | Extração de NFR                                  | ✅ **Done**      | `core/analyzer/nfr-detector.ts` (5 categorias: perf/security/reliability/scalability/a11y; addressed via tag `nfr` ou título) + `detect-nfr.ts`. 8 testes.                                                                                                                                           |
| **M5**  | Edge-cases / error-paths                         | ✅ **Done**      | `core/analyzer/edge-case-detector.ts` (happy-path-only → gap; `required` p/ security/auth) + `detect-edge-cases.ts`. 8 testes.                                                                                                                                                                       |
| **M8**  | Design drift (graph-only)                        | ✅ **Detector**  | `detect-design-drift.ts` (ADR órfã — decision sem link a requisito; reusa `orphanDecisions`). **Follow-up:** wiring repo-map/seam (filesystem) no `gate design`.                                                                                                                                     |
| **M9**  | Estimate drift (size↔estimate)                   | ✅ **Detector**  | `detect-estimate-drift.ts` + `reestimate.ts`. **Follow-up:** velocity histórica + transitive deps em `next-task.ts` (hot-path).                                                                                                                                                                      |
| **M10** | Timeline de completude (event-store **ativado**) | ✅ **Done**      | `src/core/gaps/completeness-events.ts` (record snapshot via `EventWriter` + `getGapsHistory`) + `agf gaps --history`. Ativa o módulo dormente `event-store` (lever mensurável). 4 testes. **Follow-up:** source-contribution (proveniência RAG) — lever separado, não-harness.                       |

### ✅ Programa core completo

**9/9 gap kinds** implementados (M0–M9), protocolo detect→delegate→verify, comando `agf gaps`,
**66 testes** (cada detector com teste de closure), 0 erros de typecheck novos, lint limpo, `agf gaps`
rodando ao vivo no grafo real. Skills regression resolvida na raiz.

### ✅ Usabilidade + ensino ao driver + demo E2E

- **Usabilidade** (`src/core/gaps/format.ts` + `gaps-cmd`): output agrupado por kind, `--limit N` por kind
  (sem truncar silencioso — mostra "+N mais"), `--severity required|recommended`, `--json` completo p/ drivers.
  Resolve o firehose (2431 gaps no grafo real → `--severity required` mostra só os ~38 blockers). 5 testes.
- **Ensino ao driver:** `agf gaps` + bloco doutrinário `AGF_GAPS` (loop detect→delegate→verify) na fonte
  de verdade → flui pros 8 arquivos de contexto por-CLI (CLAUDE/AGENTS/copilot/cursor/windsurf/gemini),
  zero MCP. Toda CLI condutora aprende a usar o harness.
- **Demo E2E** (`examples/sample-incomplete-prd.md`): PRD propositalmente incompleto. `agf import-prd` →
  13 nodes/24 edges → `agf gaps` pega traceability/weak_ac/missing_nfr/missing_edge_case (score 73/B).
  Loop PRD→grafo→detect→delegate provado ponta-a-ponta.

### Follow-ups documentados (não feitos)

M8 repo-map/seam **filesystem** grounding no `gate design` · M9 velocity histórica + `next-task` transitive
deps (hot-path, baixa prioridade — done-integrity já cobre a raiz) · M10 módulos dormentes (observabilidade)
· integração VERIFY nos gates `agf check`/`agf gate` (hoje via exit-code de `agf gaps`).

### Smoke ao vivo no grafo real (600+ nós)

`agf gaps --json` → todos os detectores disparam: `traceability_break:84, ac_coverage:15, weak_ac:1784,
missing_nfr:5, missing_edge_case:520, ambiguous_ac:20, non_atomic:2`. Loop detect→delegate→verify provado E2E.

**Tuning follow-up:** `weak_ac` (1784) e `missing_edge_case` (520) são altos num grafo maduro — todos
`recommended` (não bloqueiam). Considerar `agf gaps --limit N` / dedupe por-nó p/ usabilidade.

## ⚠️ Regressão pendente (corrigir PRIMEIRO ao retomar)

`src/tests/skills-lifecycle.test.ts:66` exige seções `## When / ## Flow / ## Steps /

## Exit`em cada`.agents/skills/<skill>/SKILL.md`. O `buildCodexSkill` novo

(`src/core/config/codex-skill-specs.ts`, commit `afb62b1`) emite `## When /

## Comandos agf / ## Flow / ## Exit`— **falta`## Steps`\*\*.

- Passou despercebido: `test:blast` usa o grafo de imports do Vite; esse teste lê os
  `.md` via `readFileSync` (não importa), então não entrou no changed-set.
- **Fix (escolher 1):**
  1. Adicionar uma seção `## Steps` em `buildCodexSkill` (renderizar o `flow` como
     passos numerados, mantendo `## Comandos agf`), **e regenerar** os 14
     `.agents/skills/*/SKILL.md` (rodar `runUpdate(dir, { only: ['codex-skills'] })`); **ou**
  2. Atualizar `skills-lifecycle.test.ts` para o novo contrato (When/Comandos/Flow/Exit).
  - Recomendado: **opção 1** (mantém o contrato "<100 linhas, seções fixas" que o teste codifica).

## O que já existe (M0+M1) — arquivos

- `src/core/gaps/gap-types.ts` — `Gap`, `EnrichmentRequest{action,instruction,options,applyVia}`,
  `GapReport` (espelha `GateReport`), `buildGapReport`, `gapGradeFromScore`, `GAP_KINDS`.
- `src/core/gaps/index.ts` — `GAP_DETECTORS[]` (registry) + `detectAllGaps(doc, kinds?)`. **M1+ adiciona o detector aqui.**
- `src/core/gaps/detect-traceability.ts` — M1 (none→required, untested→recommended).
- `src/core/designer/traceability-matrix.ts` — `buildFullChainTraceability` + tipos `FullChainReport`/`FullChainEntry`.
- `src/core/designer/definition-of-ready.ts` — check `traceability_full_chain` (recommended).
- `src/cli/commands/gaps-cmd.ts` + registrado em `src/cli/index.ts` (após `gate`).
- `src/core/utils/errors.ts` — `GapVerificationError`.
- Testes: `src/tests/gaps-protocol.test.ts`, `src/tests/gaps-traceability.test.ts` (21 ✅).

## Padrão para cada milestone seguinte (M2..M9)

1. `src/core/gaps/detect-<x>.ts` → `detect<X>(doc): Gap[]` (puro, determinístico).
2. Adicionar `detect<X>` em `GAP_DETECTORS` (`src/core/gaps/index.ts`).
3. (Opcional) check no gate apropriado (DoR/DoD/validate) com severidade correta.
4. Teste `src/tests/gaps-<x>.test.ts`: detect correto + **closure** (aplicar `applyVia` no
   fixture → re-detectar → gap some, `ready` vira true).

## Reuso confirmado (NÃO reconstruir)

- AC: `core/analyzer/ac-parser.ts` (`parseAc`), `core/utils/ac-helpers.ts` (`getNodeAcTexts`, `nodeHasAc`).
- Termos vagos: `VAGUE_TERMS` em `core/analyzer/ac-validator.ts` (extrair p/ shared) + `suggestReformulations`.
- Atomicidade/tamanho: `core/planner/decompose.ts` (`detectLargeTasks`).
- Deps/critical path/ciclos: `core/planner/dependency-chain.ts` (`findTransitiveBlockers`, `findCriticalPath`, `detectCycles`).
- Velocity: `core/planner/velocity.ts` (`calculateVelocity`, `byCategory`).
- Code-intel: `core/context/repo-map.ts` (`buildRepoMap`), seam: `core/analyzer/seam-audit.ts` (`auditFile`, `classifySpecifier`).
- Decompose: `core/planner/smart-decompose.ts` (M2/M7 ligam aqui).

## Como retomar (verificar estado)

```bash
npx vitest run src/tests/gaps-protocol.test.ts src/tests/gaps-traceability.test.ts   # 21 ✅
npx tsx src/cli/index.ts gaps --help                                                  # comando vivo
# corrigir a regressão de skills-lifecycle.test.ts (ver acima), depois seguir M2.
```

## Avisos de estado (working tree)

- Trabalho M0/M1 **não commitado** (vive na working tree junto com WIP paralelo do dono:
  `src/cli/commands/code-cmd.ts` untracked — tem erro de typecheck na linha 329 (`depth`),
  `CLAUDE.md` modificado, `.tgz` + `docs/roadmap-260-commands.md` untracked).
- 3 commits já feitos nesta sessão **não pushados** (`afb62b1` skills/context, `fd3a691`
  typecheck fixes, `201f9a3` mcp→context7). Push p/ `main` foi bloqueado pelo classificador
  (rodar `! git push origin main` manualmente, dispara mirror→master).
- Ordem de execução restante: **fix skills-lifecycle** → M2 → M3 → M6 → M7 → M4 → M5 → M8 → M9 → M10.
