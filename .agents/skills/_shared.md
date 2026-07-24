# \_shared.md — agent-graph-flow Common Skill Content

System file. Not a skill itself. Referenced by lifecycle and domain skills via `<!-- shared:section_name -->`.

**Skills não duplicam mais esta seção.** Cada skill tem apenas 4 linhas de referência compacta.
Consulte esta seção para detalhes completos de economia de tokens, perfis e anti-padrões.

**CLI-first:** every workflow drives the `agf` CLI — there is NO MCP server. Commands below are real `agf <cmd>` invocations. A skill that names an MCP tool is rejected by the test suite — that tool is not mounted in a real session, so the agent either errors or invents the result.

**Companion protocols** — read the one the task needs, not all three:

| Protocol                                                     | Read it when                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [`_rag-protocol.md`](_rag-protocol.md)                       | You need the token-economy contract: `--ai`, `--select`, `agf retrieve-command`, `agf exec chain`, `agf compress` |
| [`_pilot-protocol.md`](_pilot-protocol.md)                   | You are driving an executor and must hand it a brief it cannot misread                                            |
| [`_pilot-protocol-template.md`](_pilot-protocol-template.md) | You are filling that brief in — it is the skeleton, with `<fill: …>` slots                                        |

---

## Lifecycle Phases

9 fases: **ANALYZE → DESIGN → PLAN → IMPLEMENT → VALIDATE → REVIEW → HANDOFF → DEPLOY → LISTENING**

| #   | Phase     | Purpose                                         |
| --- | --------- | ----------------------------------------------- |
| 1   | ANALYZE   | PRD, requisitos, Definition of Ready (7 checks) |
| 2   | DESIGN    | Arquitetura, ADRs, C4 Model                     |
| 3   | PLAN      | Sprint planning, decomposição atômica           |
| 4   | IMPLEMENT | TDD Red→Green→Refactor, pipeline v8.0           |
| 5   | VALIDATE  | E2E, AC, DORA quality metrics                   |
| 6   | REVIEW    | Blast radius, code review, mermaid              |
| 7   | HANDOFF   | PR, snapshot, export knowledge                  |
| 8   | DEPLOY    | CI pipeline, release, post-release              |
| 9   | LISTENING | Retrospective, next cycle seeding               |

---

## Phase Gates

Antes de mudar de fase, rodar o gate correspondente (`agf gate <phase>`):

| De → Para            | Gate (`agf`)                         | Pré-requisitos                            |
| -------------------- | ------------------------------------ | ----------------------------------------- |
| ANALYZE → DESIGN     | `agf gate design`                    | ≥1 epic/requirement no grafo              |
| DESIGN → PLAN        | `agf gate design`                    | ADRs, interfaces, coupling + harness ≥ 55 |
| PLAN → IMPLEMENT     | `agf decompose`                      | tasks atômicas com AC testável            |
| IMPLEMENT → VALIDATE | `agf check <id>`                     | ≥50% tasks done com AC testável           |
| VALIDATE → REVIEW    | `agf check <id>` (DoD + status_flow) | Todos checks passam                       |
| REVIEW → HANDOFF     | `agf gate review`                    | `agf export` + blast radius ok            |
| HANDOFF → DEPLOY     | `agf gate handoff`                   | `agf snapshot create` + memórias salvas   |
| DEPLOY → LISTENING   | `agf gate deploy`                    | Release validado + harness ≥ 70           |

---

## Pipeline

**Primário (2 calls — obrigatório):**

```
agf start → [implementar com TDD] → agf done <id>
```

**Granular (controle fino):**

```
agf next → agf context <id> → [TDD] → agf check <id> → agf node status <id> done
```

**WIP = 1** — Máximo 1 task `in_progress` por agente. Lei de Little: `cycle_time = WIP / throughput`.

---

## Mapa de Decisão de Ferramentas (intent → comando/skill)

**O agente externo conduz** (delegate-first: o LLM é seu, não do agf). Use esta tabela para escolher a ferramenta certa por intenção. Não lembra o comando exato? **`agf retrieve-command "<intenção>"`** (RAG-IN) resolve qualquer caso abaixo.

| Sua intenção                                                              | Ferramenta agf                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Ideia vaga / "o que construir?" / planejar do zero                        | skill **graph-backlog-generation** (PLAN) → vira backlog                 |
| Implementar o backlog (task pronta) end-to-end                            | skill **graph-builder-leafcutter** (BUILD) · `agf start`                 |
| Endurecer: bugs/segurança/cobertura/observabilidade                       | skill **graph-woodpecker** (HARDEN)                                      |
| "O que faço agora?"                                                       | `agf next` (pull) · `agf start` (next+context+in_progress)               |
| Antes de codar — não duplicar trabalho/stream                             | `agf preflight "<tópico>"` (git+grafo+WIP)                               |
| Entender uma task antes de tocar código                                   | `agf context <id> --compressed` + `agf search`/`rg`                      |
| Criar estrutura (epic/tasks/edges) antes de codar                         | `agf import-prd` · `agf node add` · `agf edge add`                       |
| Validar antes de fechar                                                   | `agf check <id>` (DoD) → `agf done <id>` (blast gate)                    |
| Delegar uma task a um executor                                            | `agf brief <id>` → executor → `agf submit <id> --result`                 |
| Achar lacunas de completude (req↔task↔test, AC, NFR)                      | `agf gaps --severity required --select data`                             |
| Medir prontidão/qualidade do código                                       | `agf harness` (9 dimensões, A–D)                                         |
| Encadear vários passos agf (1 round-trip)                                 | `agf exec chain "a; b; c"` · `agf exec pipe`                             |
| **Rodar QUALQUER shell** (git/ls/dir/grep/find/cat/test/build/powershell) | **`agf compress run -- <cmd>`** (hookless) · Claude Code = hook auto     |
| Ver/gerenciar o cache de prompt (RAG-cache)                               | `agf cache stats` (hit rate, tokens/$ poupados) · `agf cache plan-store` |
| Escolher provider/custo da chamada LLM (modo `--live`)                    | `agf provider use <id>` · `--pin <model>` · tier-router                  |
| Ver economia (tokens/$/levers)                                            | `agf metrics --economy-report` · `agf savings` · web `agf dashboard`     |
| Scaffold/boilerplate pronto (não gerar do zero)                           | `agf montar-output "<objetivo>"` (RAG-OUT)                               |
| Criar skill/agent/hook                                                    | `agf skill new` · `agf agent create` · `agf hooks add`                   |
| Descobrir comandos / não sei por onde começar                             | `agf help` · `agf retrieve-command "<intenção>"`                         |

> Regra de ouro: **se não tem nó no grafo, crie primeiro** (`agf node add`/`import-prd`) — nenhuma implementação fora do grafo. Tudo via CLI `agf` — zero MCP.

---

## Definition of Done

9 checks executados em `agf check <id>` (e em `agf done <id>`):

| #   | Check                     | Severidade   | O que verifica                                                                                                    |
| --- | ------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `has_acceptance_criteria` | **required** | Task ou parent tem AC                                                                                             |
| 2   | `ac_quality_pass`         | **required** | Score AC ≥ 60 (INVEST)                                                                                            |
| 3   | `no_unresolved_blockers`  | **required** | Nenhum `depends_on` para node não-done                                                                            |
| 4   | `status_flow_valid`       | **required** | Passou por `in_progress` antes de `done`                                                                          |
| 5   | `has_description`         | recommended  | Descrição não-vazia                                                                                               |
| 6   | `not_oversized`           | recommended  | Sem L/XL sem subtasks                                                                                             |
| 7   | `has_testable_ac`         | recommended  | ≥1 AC testável                                                                                                    |
| 8   | `has_estimate`            | recommended  | xpSize ou estimateMinutes preenchido                                                                              |
| 9   | `has_test_files`          | recommended  | testFiles populated                                                                                               |
| 10  | `economy_awareness`       | recommended  | Lê o `llm_call_ledger`: só falha se a task GASTOU tokens LLM sem lever/cache/projeção (0 gasto = delegate, passa) |

Grades: A (85-100%), B (70-84%), C (55-69%), D (<55%).

---

## Definition of Ready

7 checks — gate ANALYZE → DESIGN:

| #   | Check                     | O que verifica                   |
| --- | ------------------------- | -------------------------------- |
| 1   | `has_requirements`        | ≥1 epic ou requirement no grafo  |
| 2   | `has_acceptance_criteria` | Tasks ou AC nodes existem        |
| 3   | `no_orphans`              | Sem requirements ou tasks órfãos |
| 4   | `no_cycles`               | Sem ciclos de dependência        |
| 5   | `has_constraints`         | ≥1 constraint node               |
| 6   | `has_risks`               | ≥1 risk node                     |
| 7   | `prd_quality_score`       | Score PRD ≥ 60                   |

---

## Token Economy (Economia de Tokens)

**Aplique em TODA interação com o grafo. O ganho é acumulativo e brutal.**

### Flags de Projeção (~80-90% redução de tokens)

| Flag           | Quando usar                                                             | Exemplo                                          | Economia        |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------ | --------------- |
| `--select`     | Sempre que só precisa de campos específicos                             | `agf next --select data.node.id,data.node.title` | ~80-90%         |
| `--profile`    | Preset de campos por agente (`claude-code\|copilot\|opencode\|minimal`) | `agf next --profile claude-code`                 | ~70-90%         |
| `--compressed` | Contexto de task (sempre)                                               | `agf context <id> --compressed`                  | ~50-70%         |
| `--limit`      | Query com muitos resultados                                             | `agf query --limit 10`                           | Evita overflow  |
| `--pretty`     | Debug humano apenas                                                     | `agf next --pretty`                              | 0% (gasta mais) |
| `--format`     | Export específico                                                       | `agf export -o file.json`                        | N/A             |

`--select` sempre vence quando `--profile` e `--select` são dados juntos. Path inválido em `--select` → cai no envelope completo (nunca quebra).

**Regra de ouro:** `agf query` sem `--select` = desperdício. `agf context` sem `--compressed` = desperdício.

### Delegação & RAG (recupera, não despeja)

| Comando                             | Quando usar                     | Por quê                                                                        |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `agf brief <id>`                    | Delegar uma task a um executor  | Spec ≤500 tokens (intenção/AC/contrato/blast) em vez de re-ler arquivos        |
| `agf retrieve-command "<intenção>"` | Não lembra o comando exato      | RAG-IN: devolve o comando certo em vez de paginar `--help`                     |
| `agf montar-output "<objetivo>"`    | Precisa de scaffold/boilerplate | RAG-OUT: scaffold com slots preenchidos em vez de gerar do zero                |
| `agf cache stats`                   | Ver/reusar o cache de prompt    | RAG-cache: hit rate + tokens/$ poupados pelo prefix-cache (reuso, não regerar) |

### Composição Nativa (zero shell, cross-platform)

| Modo             | Quando usar                | Exemplo                                    |
| ---------------- | -------------------------- | ------------------------------------------ |
| `agf exec pipe`  | Precisa do `.data` interno | `agf exec pipe next --select data.node.id` |
| `agf exec chain` | Sequência de comandos      | `agf exec chain "next; check <id>"`        |

**Regra:** Nunca use `&&` ou `|` do shell. Sempre `agf exec`.

### Compressão de Output (TODO comando shell externo)

**Regra dura:** TODO comando de shell — `git`, `ls`, `dir`, `cat`, `grep`/`rg`, `find`, `npm`/`pnpm`, `cargo`, build, test, **PowerShell**, etc. — passa pela compressão determinística do agf antes de você LER a saída. Saída bruta de shell = tokens desperdiçados.

- `agf compress run -- <cmd>` — roda o comando e comprime o stdout (ou `cmd | agf compress run --stdin`). Reversível via `agf retrieve <hash>` (CCR).
- `agf compress` — a engine de compressão; `discover` (acha filtros) · `test <file>` (preview). Nunca envolva `agf` em `agf compress` — a saída do próprio agf já é mínima.
- `agf compress discover` — descobre filtros automáticos
- `agf compress test <file>` — comprime output de teste

> **⚠️ GUARDRAIL CLI-AWARE (obrigatório):**
>
> - **Claude Code** — o hook `PostToolUse` comprime automaticamente. **NÃO** prefixe manualmente com `agf compress run --`; isso causaria dupla-compressão.
> - **CLIs sem hook (Copilot CLI / Codex / OpenCode / etc.)** — envolver output de shell em `agf compress run -- <cmd>` é **OBRIGATÓRIO** antes de ler qualquer output volumoso. Exemplo: `agf compress run -- npm test` em vez de `npm test` diretamente.
>
> Regra: Claude Code = hook automático (não tocar); hookless = prefixo `agf compress run --` obrigatório.

### Medir & calibrar (transforma promessa em número)

- `agf metrics --economy-report` — tokens/$ por task + o que as alavancas pouparam.
- `agf metrics --simulate` — re-precifica a fatura real sob TODOS os modelos (qual provider sairia mais barato).
- `agf savings` — economia cumulativa (ledger real, cached tokens contabilizados).
- `agf calibrate` — calibra o limiar do portão RAG por score×saved.

### Provider & Tier Routing (3º pilar — a maior alavanca de CUSTO)

A _mesma_ chamada custa 10–100× menos no provider/modelo certo. Roteie por custo **antes** de gastar:

| Comando                              | Quando usar                                           | Ganho                                   |
| ------------------------------------ | ----------------------------------------------------- | --------------------------------------- |
| `agf doctor --providers`             | Início de sessão — ver quais providers há no env      | Evita escolher um provider sem chave    |
| `agf provider use <id>`              | Escolher por onde a chamada LLM vai (qualquer agente) | Troca o gateway sem MCP                 |
| `--pin <model>` (em `run`/`deliver`) | Fixar um modelo barato p/ a task                      | Ex.: `--pin deepseek/deepseek-v4-flash` |
| tier-router (automático)             | Deixe o agf escolher: cheap→build→frontier            | Modelo proporcional à complexidade      |
| `agf eval --models <ids> --live`     | Decidir o melhor custo-por-sucesso                    | Scorecard resolve% × $                  |

> **Regra:** tarefa trivial/mecânica → tier cheap (deepseek-v4-flash); build → llama-4-maverick; só o que exige raciocínio profundo → frontier. Nunca queime um modelo frontier num lint/rename.

### Levers de Economia (opt-in, bio/matemáticas — default OFF)

- `agf economy list` — lista cada lever com `enabled` + tokens `saved` cumulativos.
- `agf economy on <lever>` / `agf economy off <lever>` — liga/desliga (entra no `economy_lever_ledger`).
- Catálogo (fundamentado em papers): `memory_salience` (ACT-R), `ncd_dedup` (Kolmogorov/NCD), `forage_stop` (MVT de Charnov), `budget_kleiber` (lei de Kleiber 3/4), `heat_kernel` (difusão), `mdl_select` (MDL de Rissanen).

### Levers automáticas do gateway (GRÁTIS — agem sozinhas, sem comando)

Já operam em toda chamada LLM via agf; o agente não precisa acionar, só **saber que existem** e preferir o caminho agf:

- **diff-edits** — emite só a região alterada, não o arquivo todo.
- **repo-map ranqueado por PageRank** (~1k tok) — mapa do repo em vez de despejar arquivos.
- **lossy-gate** — auto-reverte se a compressão quebra o sentido.
- **content-router / SmartCrusher** — comprime arrays JSON homogêneos + AST de código.
- **CCR reversível** — cacheia o original + marcador `⟨ccr:hash⟩`; resgate com `agf retrieve <hash>`.
- **AAAK + retry com feedback compacto** — menos reprocessamento.

> Cada economia entra no `llm_call_ledger`/`economy_lever_ledger` → visível em `agf metrics --economy-report`, `agf savings` e na aba **Economy** da web (`agf dashboard`).

### Exemplos Práticos (cópie e cole)

```bash
# Puxar próxima task com projeção
agf next --select data.node.id,data.node.title

# Contexto compacto de task
agf context node_abc123 --compressed

# Query com projeção
agf query --status ready --select data[].id,data[].title

# Composição nativa (sem shell: nada de $(), &&, |, /tmp) — encadeia no próprio agf
agf exec chain "next --select data.node.id; context <id> --compressed"

# Comprimir output de ferramenta EXTERNA (grep/test/build) — nunca o do próprio agf
agf compress test src/tests/foo.test.ts
```

### Anti-Padrões de Economia

- ❌ `agf query` sem `--select` → gera JSON completo
- ❌ `agf context` sem `--compressed` → gera contexto pesado
- ❌ `agf next` sem `--select` → gera envelope completo
- ❌ Shell `&&` ao invés de `agf exec chain`
- ❌ `cat` + `grep` ao invés de `agf compress`
- ❌ Re-ler arquivos no contexto ao invés de `agf brief <id>` para delegar
- ❌ Paginar `--help` ao invés de `agf retrieve-command "<intenção>"`
- ❌ Rodar tarefa trivial num modelo frontier → roteie p/ tier cheap (`agf provider use` / `--pin`)
- ❌ Gerar do zero o que `agf montar-output` (RAG-OUT) entrega como scaffold pronto
- ❌ Ignorar `agf metrics --simulate` antes de um lote caro (não sabe qual provider é mais barato)

---

## XP Principles

1. **TDD mandatory** — Teste antes do código. Sem teste = sem implementação.
2. **Anti-one-shot** — Nunca gere sistemas inteiros em um prompt. Decomponha em tasks atômicas.
3. **Atomic decomposition** — Cada task deve ser completável em ≤2h.
4. **Code detachment** — Se a IA errou, explique o erro via prompt. Nunca edite manualmente.
5. **Pull, not Push** — Usar `agf next` para puxar a próxima task (pull system).

---

## Flow Principles (Lean + TOC)

- **WIP = 1** — Um agente, uma task ativa.
- **Bottleneck first** — Se VALIDATE acumula, parar de implementar e validar.
- **Eliminar desperdício**: overproduction, waiting, overprocessing, defects.

---

## Harness Engineering

Agent Readiness Score (0-100). 9 dimensões: Type Coverage, Test Coverage, Architecture Fitness, Docs Coverage, Naming Clarity, Error Handling, Context Density, Provenance Coverage e **Connectivity** (alcançável de ≥1 superfície — capacidade dormente entrega zero). Leia os pesos e a nota do próprio comando: `agf harness --select data.breakdown`.

Grades: A ≥ 85, B ≥ 70, C ≥ 55, D < 55.

---

## Error Recovery

- **DoD gate fails:** Corrigir checks com falha → re-run `agf check <id>` → `agf done <id>`
- **Missing node:** Criar via `agf node add` ANTES de codar
- **Test failures:** Diagnosticar root cause, nunca pular testes
- **Blocked task:** Resolver blockers ou `agf next` para a próxima desbloqueada

---

## Golden Rules (universal engineering — every graph-\* skill obeys these)

Distilled from real delivery loops. They are what makes two different users/models ship the SAME quality. Non-negotiable in PLAN, BUILD and HARDEN:

1. **Investigate before you write — EXPAND, don't recreate.** `git log`/`git status` + graph (`agf preflight`/`search`) + `grep -rn` for the owning module FIRST. Extend what exists; net-new only when provably absent. Recreating is the #1 failure mode.
2. **Spec is the source of truth for behavior.** When in doubt about ANY field/rule/layout, read the project's spec docs before implementing — never from memory. Spec ambiguous/silent? Document the assumption in the docblock + the close-out report, and flag it — never invent silently.
3. **DRY / single source of truth.** One authoritative representation per fact (enum, mapping, helper). Seeing the same block twice → extract to the owning module and point both consumers at it.
4. **TDD is mandatory.** RED (failing test from the AC) → GREEN (minimal code) → REFACTOR. No test = no implementation. UI surface without unit-test infra? Use a **static contract test**: a test in the main runner that `readFileSync`s the UI sources and asserts the AC (banned strings, exact option sets) — deterministic, runs in every blast.
5. **Physical triangulation (anti-hallucination).** Done only counts when AC ↔ code on disk ↔ test on disk all agree. Self-reported "done" without physical files is a lie; `agf done` enforces it (PHANTOM_TESTFILE), never `--force` past it dishonestly.
6. **Prove value in the consumer's mode.** Green units ≠ delivered. Exercise the path the real consumer uses (route mounted, flag default ON, tela wired). Dormant capability (exported-but-unconsumed, UI calling a nonexistent endpoint) is leaked value — wire it or file a node.
7. **Honesty nodes.** Every loose end discovered mid-build becomes a `risk`/`bug`/`task` node BEFORE done. Pre-existing failures are proven pre-existing (`git stash -u` → rerun → pop), never absorbed silently.
8. **Quality is a gate, not prose.** Files < 800 lines, functions < 50, 1 responsibility, no dead code/imports, structured logger (never console.\* in prod code), typed errors. Legacy violations: don't grow them; bypass gates only with justification IN the commit message + a tracking node.
9. **Deterministic sweeps over context dumps.** Locate/count/cross with `grep`/`sed`/`comm`/`jq` first; read whole files only to understand them. Output economy: diff-edits, `--select` projections, one `exec chain` over N round-trips.
10. **Deposit pheromones.** After each task: `agf memory write pheromone-<slug>` with what worked + the gotchas (so the next iteration skips the diagnosis you already paid for), linked with `[[other-pheromone]]`.
11. **Land on `main` — commit & push, no stray branch.** BUILD/HARDEN own git: branch-per-work → merge `main` → push → **delete the branch same session** (never leave orphan/unmerged work). PLAN never touches git — the graph (`graph.db`) is branch-agnostic. Stray branch = recurring cost + risk of lost work.
12. **Single loop — never multi-agent / workflow fan-out.** Drive ONE loop; delegate inside it via `agf brief`/`agf submit`. Parallel agent swarms burn output tokens (the dominant cost) and have exhausted whole token budgets — forbidden unless the human explicitly asks that turn.
13. **Enforcement = deterministic trigger, not "the agent remembers".** What must always hold descends into a gate that fires by itself: `agf check` (DoD) · `agf gate <phase>` · `PHANTOM_TESTFILE` on `agf done` · `agf lint-files` (800-line git gate). A rule with no trigger is a checklist, not enforcement.
14. **Decide the next step (don't ask "which?").** Every cycle ends by choosing the single best next action and **naming the principle** that chose it — see Close-out Report Format below.

### ↔ agf enforcement map (bind each rule to what mechanically delivers it)

So any model honors the rules from the CLI alone — no reliance on memory:

| Rule                             | agf mechanism that delivers/enforces it                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1 investigate / EXPAND           | `agf preflight "<topic>"` (git+graph+WIP) · `agf search`/`agf query`/`agf code search` · `agf wire-dormant --ingest` |
| 2 spec = source of truth         | read spec docs / `agf context <id>` before coding; assumption → docblock + close-out                                 |
| 3 DRY / single source            | `contract` node = authoritative shape · RAG-OUT `agf montar-output` caches scaffold                                  |
| 4 TDD mandatory                  | `agf check` (DoD) · `agf tdd-score` · `npm run test:blast` gate                                                      |
| 5 physical triangulation         | `agf gaps --kind phantom_done` + `PHANTOM_TESTFILE` on `agf done` (testFiles **and** implementationFiles on disk)    |
| 6 prove value in consumer mode   | DELIVERY TABLE `Prova` (receipt + commit) + reproduce via consumer path · `agf metrics`/`agf savings` (real numbers) |
| 7 honesty nodes                  | `agf node add --type risk\|bug` **before** `done`; pre-existing failure proven via `git stash -u`→rerun→pop          |
| 8 quality is a gate              | `agf harness --violations` · `agf lint-files` (files<800/fn<50/no dead code/typed errors)                            |
| 9 deterministic sweeps + economy | `agf … --select <path>` · `agf exec chain` · `agf compress` (external output) · diff-edits                           |
| 10 pheromones                    | `agf memory write pheromone-<slug>` (rule + when to discard; code/graph beat memory)                                 |
| 11 git on main                   | BUILD/HARDEN own git (branch→merge→push→delete); PLAN never touches git                                              |
| 12 single loop                   | `agf brief`/`agf submit` (delegate in-loop, no swarm)                                                                |
| 13 deterministic enforcement     | `agf check` · `agf gate <phase>` · `agf done` (PHANTOM_TESTFILE) · `agf lint-files` git gate                         |
| 14 decide next step              | Close-out `Próximo: X — porque [fundamento]` (below)                                                                 |

---

## Verification lineage (why every graph-\* pillar verifies the same way)

All three pillars make the same move under different names — PLAN runs a completeness
critic, BUILD gates on `phantom_done` (AC↔code↔test on disk), HARDEN reproduces a bug
with a failing test before claiming it. That shared discipline has a name and an
evidence base worth stating once:

- **CRITIC** (Gou et al., ICLR 2024, arXiv:2305.11738) — self-correction works only when
  it is _tool-interactive_: verify against an external tool, then amend. Its conclusion is
  "the crucial importance of external feedback". → **every "done / verified / complete"
  claim must cite a tool result** (a `grep`, a `node show`, a file on disk, a green test),
  never an assertion.
- **Chain-of-Verification, factored** (Dhuliawala et al., ACL 2024, arXiv:2309.11495) —
  answer each verification question from a **fresh read**, not by re-reading your own draft;
  a check that re-reads its own reasoning just re-confirms it. → run the query again over the
  repo/graph; "I said it works above" is not evidence.
- **Reflexion** (Shinn et al., NeurIPS 2023, arXiv:2303.11366) — an agent improves across
  attempts only when it records _why_ a miss happened and the next attempt reads it. → durable
  lessons (the generator blind-spot, not the one-off fix) go into the owning skill; the skill
  is the persistent reflection buffer.
- **Caveat (Huang et al., ICLR 2024, arXiv:2310.01798)** — _intrinsic_ self-correction with no
  external signal (re-reading your plan, "are you sure?") measurably DEGRADES output. Grounding
  in a tool is not optional polish; it is what separates real critique from self-confirmation.

This is golden rule 8 (deterministic trigger, not an agent remembering) applied to the agent's
own claims. Each pillar's skill body carries the domain-specific form; this is the shared root.

Every delivery cycle ends with this report to the human. It is how trust is built without them re-verifying:

```markdown
## Resumo do loop

**N tasks + M épicos promovidos** (grafo: X→Y done), tudo com TDD, blast verde e push na main:

| Entrega                 | O quê                                                   | Prova                        |
| ----------------------- | ------------------------------------------------------- | ---------------------------- |
| **<ID> <título curto>** | 1-2 frases do que mudou e POR QUÊ (o valor, não o diff) | <n> testes · `<commit-hash>` |

**Valor no produto:** para CADA entrega, 1 frase objetiva do ganho no TODO do produto — que capacidade end-to-end ela destrava, aproxima ou torna confiável, do ponto de vista de quem usa o produto, NÃO o que o código faz isolado. Diga o efeito no sistema inteiro ("o oráculo agora recusa falso-sucesso → qualquer verde do produto virou confiável"; "a bridge lê o dataset inteiro sem rolar → o diferencial vs Selenium está de pé"), nunca o mecanismo ("criei a função judge()"). Se uma entrega não move nada perceptível no produto, diga isso — é sinal de capacidade dormente (regra 9).

**Progresso do backlog:** **X% concluído do backlog planejado** — com os números absolutos (`Y/Z tasks done`) e a fonte real, nunca estimado. Compute do grafo: tasks `done` ÷ total de tasks planejadas (`agf stats --select data.byStatus` para o corte por status; se precisar do total só de `task`, cruze com `agf query --type task`). Reporte o task-completion (não o node-count total, que infla com epic/contract/risk/KR). Uma frase de contexto ajuda ("as fundações E1–E5 fecharam; falta o pipeline E10 e a camada de adjudicação E13"), para o humano ver quanto do PLANO já virou realidade e o que falta.

**Achado transversal:** (se houver) o padrão/bug de classe descoberto que atravessa entregas — a informação que o humano não pediu mas precisa saber.

**Honestidade:** assunções documentadas, nodes de risco criados (`node_xxx`), violações pré-existentes bypassed com justificativa.

**Próximo: <TASK> — porque [fundamento nomeado]** (ROI/maior-alavanca · Pareto 80/20 · TOC/gargalo · risco-primeiro · ordem-de-dependência · dado medido). Siga nele por padrão; alternativas só como nota curta, nunca como pergunta aberta.
```

Rules of the format: **lead with the outcome**; every claim carries a physical proof (test count + commit hash); **every delivery states its product-level value (effect on the whole, not the mechanism) AND the batch reports % of the planned backlog done (real graph numbers, task-completion, never estimated)**; transversal findings get their own line; the next step is a DECISION with a named principle, not a menu of options. Exception: genuinely-the-human's calls (cost, scope, irreversible risk) — then ask, but with your recommendation first.
