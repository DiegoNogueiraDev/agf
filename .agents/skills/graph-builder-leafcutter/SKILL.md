---
name: graph-builder-leafcutter
description: Use when an unblocked task exists in the agf graph and you want it built end-to-end — autonomously and perpetually — pulling the next task (WIP=1), investigating, implementing with TDD, learning, and selecting the next until the backlog is exhausted. Use right after graph-backlog-generation injects a backlog, or to make agf dogfood its own backlog. NOT for planning or writing a PRD (that is graph-backlog-generation). Triggers — graph-builder-leafcutter, leafcutter, golden-wren, build loop, implement the backlog, dogfood loop, continuous improvement, self-heal loop, loop de implementação, esgotar backlog, melhoria contínua.
triggers:
  - graph-builder-leafcutter
  - leafcutter
  - golden-wren
  - build-loop
version: 2.5.0
requires_agf: '>=0.20.0'
author: Diego Nogueira
date: 2026-07-03
tools_used:
  [
    start,
    next,
    preflight,
    search,
    context,
    brief,
    submit,
    done,
    check,
    tdd-score,
    node status,
    node add,
    harness,
    gaps,
    scaffold,
    retrieve-command,
    economy,
    learning,
    memory,
    savings,
    heal,
  ]
tokens: ~1300
---

# graph-builder-leafcutter

The builder. An autonomous, perpetual loop that consumes the backlog from
`graph-backlog-generation` and implements it with excellence — investigate, TDD,
review, tests, handoff, listening — while learning via ACO/pheromone stigmergy and
GA-inspired selection, and spending the fewest possible output tokens.

## When to Use

- An unblocked task exists in the graph and you want it built end-to-end
- You want `agf` to implement its own backlog autonomously, perpetually
- A backlog was just injected (by `graph-backlog-generation`) and needs execution
- You want a self-improving loop: investigate → implement → learn → reinforce → next

Do NOT use to plan or write a PRD — that is `graph-backlog-generation`.

## ⛔ Hard rule — BUILD ONLY, never plan (read this first)

When this skill is invoked you **implement tasks that already exist** — you do **not**
plan. No PRD, no new epic, no backlog decomposition, no "while I'm here let me design
the next feature". You consume nodes the planner already created; you never author the
backlog. If the work you need has **no task node**, do not invent the plan here —
**STOP and signal `graph-backlog-generation`** (or drop a one-line `task`/`risk` node
for the planner to triage), then pull the next _ready_ task. Designing scope is leaving
the builder.

The one thing you DO add to the graph is an **honesty node** — a `risk` / `bug` /
`task` stub for a loose end you hit mid-build, so nothing is faked done. That is
reporting for the planner to refine later, never a full PRD. **If that stub is a
`task` you (or the next ant) will actually pull and close, give it real testable
`--ac` at CREATION** — a spec written only into the description passes node-add but
fails the later `done` DoD on the AC-quality/testable-AC checks, forcing a mid-close
detour to backfill AC. (A `risk`/spec node is the opposite — it has no AC and closes
via the raw forward transition; see Step 4.)

The builder **owns git** (the planner never touches it): branch-per-implementation →
TDD → merge to `main` → commit/push → delete the branch. The graph says _what_; you
decide _how_, prove it with tests, and ship it. This is the exact complement of the
planner, which produces only graph nodes + plan text and touches neither code nor git
— together they run as two agents in one loop: **plan → build → plan → …**.

## Deterministic loop (low-reasoning fast-path)

If you are a low-reasoning model (Haiku, DeepSeek Flash, MiniMax, etc.), follow THIS
exactly — top to bottom, no judgement. Obey every **STOP** and **DEFAULT**. The rich
Workflow below is the same loop for stronger models; this is the compiled version.

1. `agf next --select data.id` → got an id? (Plain `agf next` sorts by strict priority — that is the
   default. Pheromone selection is opt-in with `--aco`, reproducible with `--seed <n>`.)
   **No** → check `code` in response:
   - `NO_TASKS` + `hardBlocks[]` non-empty → skip blocked tasks (runtime missing); log
     each `requiredRuntime` and continue waiting — do NOT signal the planner as exhausted.
   - `NO_TASKS` + `hardBlocks[]` empty + backlog non-empty (`agf stats`) → escalate:
     output "blocked: backlog non-empty but nothing unblocked" and surface to user.
   - `NO_TASKS` + backlog empty → **HARVEST, don't stop**: backlog-empty is the _trigger_, not the end. This is automatic — `agf autopilot` HARVESTS by default at NO_TASKS and re-pulls (generated WIRE-tasks re-feed the loop; stops only when harvest is also dry). Pass `--no-harvest` to opt out. To run it by hand: `agf migrate-ac --commit` (collapse AC-nodes into parents), close specs whose implementers are done, `agf risk triage` (surface/promote), `agf wire-dormant --ingest` (dormant capabilities → WIRE-tasks). Did harvest generate new tasks? → back to 1 (the loop self-feeds). **Only if harvest is ALSO dry** → STOP: output "backlog + harvest exhausted" and signal `graph-backlog-generation`.
2. **Pick when many are ready (no math):** lowest-id `must`; no `must` → lowest-id
   `should`; tie → lowest id. Ignore the fitness formula unless you can compute it.
3. `agf preflight "<task title>"` → verdict `wip-conflict`, or a match on **another**
   id → **divert, don't stop**: leave that task to its ant, assume your agent id and
   claim a different one (`agf next --agent <you>` — see Concurrent Multi-Agent
   Protocol). STOP only if nothing else is claimable or the conflict is on the task
   you already claimed. (`duplicate-risk` on the picked id itself = expected → go on.)
4. `agf context <id>` → read it. `agf search "<feature>"` (always present) + `rg "<key symbol>" src` (or `grep -rn "<key symbol>" src` where ripgrep is absent).
   **DEFAULT: the file already exists → edit it (EXPAND).** Only `agf scaffold` if search
   returns nothing.
5. `agf node status <id> in_progress` **and declare your file scope NOW** —
   `agf node update <id> --implementation-files … --test-files …` (as soon as you know
   what you'll touch, not at done-time). In a shared graph the declared files ARE your
   territory: they exclude colliding candidates from other ants' pulls and stop their
   done-gate from flagging your dirty files as scope creep — an undeclared file is an
   orphan that blocks the whole colony.
6. Write the **failing test first** from the AC → run it → see it fail → minimal code to
   pass. No test written = **STOP** (TDD is mandatory).
7. `npm run test:blast` → red? fix; **max 3 tries**, still red → `agf node add --type bug …`
   and **STOP**. Green → continue.
8. `agf check <id>` → a required check fails → fix it, or file a `risk` node, then retry.
9. `agf done <id>` → red on an **unrelated/pre-existing** test → `agf node add --type risk …`,
   then `agf done <id> --test-cmd "npx vitest run <your test file>"`.
10. `agf memory write pheromone-<slug>` (what worked **+ the gotcha**) → go to 1.

**Close the node before you commit, one task at a time.** `agf done` reads the _working tree_:
it refuses a clean tree (`NO_FILES_MODIFIED` — nothing was implemented) and it refuses files the
node never declared (surgical scope). Batch a whole epic into one dirty tree and the two gates
contradict each other — the only way out is `--force`, which also skips the tests. So: edit one
task's files → `agf done <id>` → commit → next task. Declare what you touched with
`agf node update <id> --implementation-files … --test-files …`; `agf gaps --kind phantom_done`
checks those paths against the disk, and a `done` without them is a hallucination.

**Never:** plan/PRD, create a file that already exists, mark done with a red gate or a
false claim, or hold >1 task `in_progress`.

## Golden Rules (builder edition)

> The full universal set (spec-first, single-source DRY, static contract tests for
> UI without unit infra, physical AC↔code↔test triangulation, prove-value-in-the-
> consumer's-mode, honesty nodes) lives in `_shared.md` → **Golden Rules (universal
> engineering)** — obey it verbatim; the list below is the builder-specific slice.
> The cycle handoff MUST follow `_shared.md` → **Close-out Report Format** (delivery
> table + Achado transversal + Honestidade + `Próximo: X — porque [fundamento]`).

The project's golden rules, distilled for IMPLEMENT. Non-negotiable:

1. **Investigate & reuse before writing.** `agf preflight` + `rg`/`agf search` for the
   owning module FIRST; **EXPAND, don't recreate** (DRY/Rule-of-Three). Net-new only
   when it provably does not exist — recreating from scratch is the top failure here.
2. **Graph is the source of truth.** No code without a node; code/graph beat memory/plan.
3. **WIP = 1, pull not push** (Little's Law: CT = WIP/TH).
4. **TDD is mandatory** — Red → Green → Refactor; no test = no implementation.
5. **Quality is a gate, not prose.** Clean Code · SOLID · KISS · YAGNI verified by
   `harness`/`tdd-score`/`check` — file <800, fn <50, 1 responsibility, no `any`, typed errors.
6. **Honesty.** Surface loose ends as `risk`/`bug` nodes; never mark `done` on a false
   claim; read savings from the ledger (`agf metrics`/`savings`), never estimate them.
7. **Dogfood.** In-repo use `npm run dev -- <cmd>`, never the stale installed binary.

## Mandatory Flow

```
scan (stats·harness·gaps) → next (WIP=1) → INVESTIGATE (preflight·rg·search → EXPAND, don't recreate)
  → mark in_progress → BUILD (TDD Red→Green→Refactor + Clean Code/SOLID + economy)
  → self-review → GATES (blast·check·tdd-score·harness[·mutation]) → done (honest gate)
  → learn (pheromone) → select next by fitness (ACO + GA) → repeat until exhausted → restart
```

WIP = 1 at all times (Little's Law: CT = WIP/TH). The **HOW to implement excellently**
(Clean Code · SOLID · DRY/KISS/YAGNI · TDD · XP · docs · logging), the **code-reuse
decision tree**, and the **practice→gate map** live in
[references/engineering-practices.md](references/engineering-practices.md); the ACO/GA +
pheromone + economy mechanics in [references/aco-economy.md](references/aco-economy.md).
Load on demand.

> The loop below is the **IMPLEMENT slice** of agf's 9-phase lifecycle. For the
> _full_ command surface — analyze · design · plan · validate · review · handoff ·
> deploy · listening, plus the provider/economy, learning/colony, graph-data, and
> ops families (every one of the ~110 commands) — load
> [references/capability-map.md](references/capability-map.md) on demand. Never
> memorize commands: `agf help` · `agf <cmd> --help` · `agf retrieve-command "<intent>"`.

> **Command-agnostic:** commands below are illustrative — the source of truth for the
> exact, current command is always `agf retrieve-command "<intent>"` (RAG-IN) or `agf help`.
> This skill never goes stale when commands are added or renamed.

## Workflow

### Step 1 — Scan & select (Monitor + ACO/GA)

```bash
agf stats --select data.byStatus · agf harness --saturation · agf gaps --severity required · agf learning stats --select data.accuracy
```

Pick the next task by **fitness = PERT × Pareto × value**, biased by pheromone
trails (`agf memory search "pheromone"`) — winning patterns reinforce, stale ones
decay. This is the ACO + GA-inspired selection.

### Step 2 — Pull, then INVESTIGATE before you touch code (golden rule)

```bash
# Encapsule os passos agf num só round-trip (sem shell &&/|) — economia de tokens:
agf exec chain "next --select data.node.id; preflight '<topic>'; context <id> --compressed"
agf search "<feature>" ; rg "<module|feature|symbol>" src   # find what exists (rg → grep -rn where no ripgrep)
agf node status <id> in_progress  # claim it only AFTER you know what you'll touch
```

> Prefira `agf exec chain "a; b; c"` a rodar `a`, `b`, `c` em linhas separadas: 1 ciclo de store, 1 envelope, menos tokens. Use `agf exec pipe` quando o passo seguinte precisa do `.data` do anterior. Funciona em `npm run dev` e contra o binário instalado (fix `665d0a91`: re-invoca via `execPath`+`execArgv`). O envelope externo do chain agora é `ok:false` se qualquer step falhar — mas a regra-mãe permanece: um `ok:true` cujo efeito você não verificou não é sucesso, confirme no grafo/disco.

- **A live SURFACE does not prove a live CAPABILITY — grep the executor.** A command
  can exist, have `--help`, be indexed by RAG and answer `ok:true` while being wired
  to a hardcoded no-op (an executor whose `available()` returns `false` by
  construction). Before you conclude a capability is merely unconfigured — and above
  all before proposing SPEND or a live run to obtain evidence — grep the executor the
  surface actually passes. Credentials present + provider selected + still
  `delegated` = unwired code, not a missing key, and no amount of money fixes it.
- **A metric a feature writes about ITSELF cannot authorize changing its default.**
  When building any gate that flips a default automatically, ask who WROTE the number
  that decides. A self-reported savings counter measures the local effect the feature
  causes and is blind to the cost it provokes elsewhere — it is the feature grading
  its own homework. Authority requires measuring BOTH arms over the SAME input.
  Detail + the live counter-example: `references/field-lessons.md`.
- **Most tasks are EXPAND-not-create.** In real loops the core module / table /
  lever usually already exists — find it and extend the owning module. Greenfield
  `agf scaffold <name>` is the exception, not the default. Recreating from scratch
  is the most common failure here (violates DRY + the golden rule).
- For a genuinely trivial task you may collapse this into `agf start` (next +
  context + in_progress), but never skip the `rg`/`search` reuse check.
- Delegating? `agf brief <id>` emits the spec; close with `agf submit <id> --result <json>`.

> **Jurisprudência desta etapa** (casos reais, causa-raiz e o blind-spot que os produziu): [references/field-lessons.md](references/field-lessons.md) → seção "Step 2 — Pull, then INVESTIGATE before you touch code (golden rule)". Carregue sob demanda.

- **`preflight` returns `duplicate-risk` matching the picked task ITSELF — that is
  expected.** Only stop for an _other_ node match or a `wip-conflict` verdict.

### Step 3 — BUILD with economy (TDD + Clean Code/SOLID)

- **RAG-IN first:** `agf retrieve-command "<intenção>"` for the exact command.
- **Expand the owning module; reuse helpers (DRY).** Create new files only for
  genuinely new concerns. Cache repeated generations in RAG-OUT (`agf montar-output`).
- **TDD Red→Green→Refactor:** write the failing test from the AC's Given-When-Then →
  watch it fail → minimal code to pass → **refactor applying Clean Code + SOLID**
  (tests stay green). One assertion focus per test; positive + negative + edge cases.

> **Jurisprudência desta etapa** (casos reais, causa-raiz e o blind-spot que os produziu): [references/field-lessons.md](references/field-lessons.md) → seção "Step 3 — BUILD with economy (TDD + Clean Code/SOLID)". Carregue sob demanda.

### Step 4 — Close out HONESTLY (self-review + gates + DoD)

**Self-review first (~30 tokens, replaces an expensive round-trip):** any placeholder
left? did scope leak? are all AC covered? is the default still intact?

```bash
npm run test:blast        # MANDATORY gate — run STANDALONE; must be green
agf check <id>            # DoD (required checks must pass)
agf tdd-score <id>        # TDD quality 0–100 (coverage + assertion diversity)
agf harness --violations  # Clean Code/SOLID/naming/errors enforced, not claimed
# optional: agf check <id> --mutation --source <file>   # robustness (kill-ratio ≥ 0.60)
agf done <id>             # marks done + suggests next
```

**Hierarchical test gates (cost ∝ risk):** `npm run test:blast` per task (above);
`npm run test:node` when an epic is promotion-ready; `npm test` once pre-PR. Promote a
phase only through `agf gate <phase>` (DoD/harness/readiness) — e.g. `agf gate deploy`
requires harness ≥ 70. Don't run the full suite per task; don't push on a red gate.

**Gate reality (earned in real loops — read before fighting a red `done`):**

> **Jurisprudência desta etapa** (casos reais, causa-raiz e o blind-spot que os produziu): [references/field-lessons.md](references/field-lessons.md) → seção "Step 4 — Close out HONESTLY (self-review + gates + DoD)". Carregue sob demanda.

- **`done` → commit, never the reverse.** `done` reads the working tree; commit first
  leaves it clean and `done` refuses with `NO_FILES_MODIFIED`. Sequence per task:
  edit → `agf done <id>` → commit → next. If you already committed, close via the raw
  forward transition with your gates green, don't fight it.
- **In a shared tree (multiple ants), other ants' untracked files appear beside yours.**
  Commit with **explicit `git add <your files>`, never `git add -A`/`.`** — an untracked
  `genesis.ts` from another ant is not your delivery.
- **Know the repo's commit rules before you write the message, not from the reject.**
  This repo enforces commitlint: subject lower-case (no Sentence-case), header ≤100 chars,
  body ≤100/line, `scope` from a fixed enum (`cli·core·graph·hooks·events·plugins·`
  `approval·tests·ci·docs`). Check the config once; a rejected commit costs a round-trip.
- **Counting a failure by CAUSE beats counting failures.** When a gate can reject for several
  reasons — never ran, ran and broke, ran and could not conclude — a single "blocked" tally
  hides the distinction the design exists to preserve, and the case that should alarm you
  (nobody ever measured) looks the same as the case that is working as intended.

### Step 5 — Learn & reinforce (stigmergy)

```bash
agf savings · agf metrics --economy-report · agf learning · agf memory write pheromone-<slug>
```

Deposit a pheromone trail for what worked **and the gotchas you hit** (so the next
iteration skips the diagnosis you already paid for); link related trails with
`[[other-pheromone]]`. Weak trails decay. `agf heal` self-repairs graph noise.
Then loop to Step 1.

**At a batch/cycle boundary (before handing back), render the handoff per `_shared.md` →
Close-out Report Format** — the DELIVERY TABLE (`Entrega | O quê | Prova`, every claim
graph-backed: `N testes · <commit>`; blocked items get their own row citing the honesty
node; epics show `test:node` promotion) + Achado transversal + Honestidade + the decided
next step (`Próximo: X — porque [fundamento]`). Obey that section verbatim — it is the
single source; do not re-improvise the format here.

### Step 6 — Exhaustion → harvest → restart

When no unblocked task remains, **harvest before stopping** — `agf autopilot` does this by default at NO_TASKS (`--no-harvest` opts out)
(or the manual pass in Step 1) — it collapses AC-nodes, surfaces risks, and turns dormant
capabilities into WIRE-tasks, re-feeding the loop. Only when the harvest is **also** dry do
you signal `graph-backlog-generation` to inject the next cycle, then resume the loop.

**WIRE-task triage — a harvest hit is raw output, not a pre-validated backlog.** Before
touching code, classify the dormant module into one of five buckets; only the first is a
mechanical wire, the rest are honest `blocked` findings:

1. **False positive — check `src/tests/` before anything else.** The dormant-scanner only
   walks CLI/TUI/MCP/web surfaces; it cannot see that a module is a deliberate test-only
   fixture/stub. `grep -rln "<exportedSymbol>" src/tests/*.ts` first — if a real test
   imports and exercises it (not just re-exports), close the node immediately as a
   confirmed false positive, no further investigation needed.
2. **Superseded, not incomplete.** A sibling module already solves the same problem
   better (and is the one actually wired) — e.g. an in-memory prototype replaced by a
   SQLite-backed store, or a naive regex duplicate replaced by a tokenize+stopword+Jaccard
   version. Tell-tale sign: the REAL wired module's own docblock explains why the dormant
   one can't work here ("each command is a fresh process, so the in-memory X cannot
   survive between tasks"). Forcing a wire here would be a regression, not a fix — block
   it citing the superior sibling.
3. **Half an epic.** The mechanism is complete and well-designed, but the consumer it was
   built for was never built (a docblock naming a specific caller that doesn't exist or
   doesn't call it; a whole plugin/subsystem directory with zero registry wiring). Building
   the missing consumer from scratch is planning-scale work — block it, name the missing
   piece precisely, and let the planner decide whether to build it.
4. **Systemic scaffolded family.** Multiple files share the exact same shape/purpose across
   different lifecycle-phase directories (e.g. one `validation.ts` per phase, all Zod
   schemas for the same never-built tool surface). Don't triage these one at a time — name
   the whole family in the first finding and block the rest with a one-line cross-reference,
   so the planner makes ONE decision instead of N.
5. **Overlaps an already-wired system.** A "generic engine" whose built-in rules duplicate
   a hardcoded checker that's already live (e.g. a configurable architecture-rule engine
   vs. the harness's own hardcoded fitness functions). Shipping it as a second, parallel
   surface confuses users more than leaving it dormant — find the one genuinely
   differentiating capability (if any) and scope a wire to _only_ that, or block with the
   overlap named explicitly.

**Only bucket 0 (genuine, safe mechanical wire) gets code.** Two safe sub-patterns worth
naming: (a) a **typed-error swap** — a dormant `XError extends GraphError` almost always has
a real throw-site in the sibling module matching its name-prefix (`grep "throw new
McpGraphError" <sibling-dir>`); safe to swap when no `instanceof` check on the generic type
exists anywhere and both extend the same base — update the one test that asserts the old
type, that's intentional, not a regression. (b) **new standalone command** — when a pure,
already-correct function has no natural existing call site (the flow that "should" call it
is detection-only, or forcing it into a tested flow risks behavior change), add a small new
`agf <verb> <arg>` command rather than bending an existing one. Zero risk: nothing calls it
unless a user explicitly does.

**Rigor check when a wire's integration test passes green on the first run** (no visible
RED): don't just trust it — `git stash -- <implementation-file>` to temporarily remove the
wire, re-run the test to confirm it now fails for the right reason, then `git stash pop`.
Proves the test is actually anchored to your change, not passing by coincidence.

> **Orçamento desta skill:** o corpo tem teto medido (ver `src/tests/skill-size-budget.test.ts`).
> Ao endurecer a skill com uma lição nova, pergunte se ela DECIDE COMPORTAMENTO em toda
> invocação — se sim, entra aqui em uma ou duas linhas; se é jurisprudência (o caso, a causa-raiz,
> o blind-spot), vai para `references/field-lessons.md` na seção da etapa. Anexar prosa ao corpo a
> cada ciclo transforma a memória do processo num custo que todo agente paga em toda sessão.

- **Abra antes de rotular — "parece artefato" é hipótese, não classificação.** Um registro com
  cara de lixo (título genérico, descrição vazia, nome de seção) pode ser escopo vivo: classifiquei
  o mesmo nó três vezes como resíduo de import e, ao abri-lo, era um PRD com oito épicos, cinco
  ainda em backlog. Rotular sem abrir apaga trabalho real do radar, e o custo aparece meses depois
  quando alguém procura o que sumiu.

- **Leia um EXEMPLO da saída, não só a contagem — é onde o falso positivo aparece.** Um detector
  novo que devolve "247 achados" parece funcionar; abrir o primeiro item revela se ele está
  acusando quem seguiu o processo. Fiz isso e descobri que cruzava um eixo só (arquivos de
  implementação) e ignorava o outro (arquivos de teste), então todo commit bem-comportado que
  adicionava um teste declarado virava achado. Num detector de PROCESSO o falso positivo custa
  mais que a omissão: uma lista que acusa inocentes é ignorada por inteiro, e aí ela não pega
  nem os casos reais.

- **Antes de qualquer heurística de casamento, grepe o ID do requisito no código.** Título, tema
  e numeração são inferência; uma referência que o implementador deixou (`REQ-X-042`, o número do
  ticket, o id do nó num comentário) é prova. Um `grep -rn "<id>" src/` custa segundos e encerra a
  investigação — descobri três requisitos "pendentes" cujas guardas citavam o próprio id na linha
  exata que os satisfazia. Só caia para casamento por conteúdo quando o grep vier vazio, e diga
  que veio vazio.
- **Uma métrica de dívida que para acima de zero pode estar CERTA — zero seria a mentira.**
  Quando o resíduo é composto de casos cuja ausência é a verdade (critérios que ninguém
  implementa, trabalho entregue fora do processo, artefatos de import), forçar o contador a zero
  exige forjar vínculos ou apagar registros. Feche cada caso com a razão escrita e relate o piso
  como resultado, não como pendência.

- **Critério de release quase nunca se satisfaz implementando — e tratá-lo como feature faz você
  procurar código que não existe.** "Atingir grade X", "manter os testes verdes", "encerrar os
  épicos em voo", "custo documentado": cada um fecha por um método diferente — verificar o estado,
  medir e publicar o reprodutor, promover um check já existente a bloqueante, ou construir o
  cobrador que faltava. Identifique QUAL antes de abrir editor. E quando fechar um desses, escreva
  os pontos cegos no próprio nó: um critério fechado em silêncio vira promessa maior do que a
  entrega.

- **"Está excluído" não é o mesmo que "alguém decidiu excluir" — cheque se o arquivo já existiu.**
  Um caminho em `.gitignore`/`exclude` parece uma escolha a respeitar, mas `git log --diff-filter=A`
  pode revelar que ele NUNCA foi rastreado: aí não houve decisão, houve ausência, e tratá-la como
  vontade alheia é como uma lacuna vira permanente. Compare com os irmãos (os outros hooks, os
  outros arquivos daquela pasta): quando os pares são versionados e só um não é, a anomalia é a
  exclusão.
- **Antes de tornar compartilhado um script que era local, confira que todo runner que ele invoca
  existe num clone limpo.** Ferramenta instalada na SUA máquina (bun, uma CLI global, um binário
  de PATH) passa despercebida enquanto o script é local e quebra o fluxo de todo mundo no momento
  em que vira versionado. Normalize para o que os arquivos irmãos já usam e meça — a versão
  portátil costuma custar o mesmo.

- **Quando um relatório quebra o total por MÉTODO, o método é o dado — não o total.** Um ledger
  que separa "medido" de "estimado" fez isso porque as linhas não são comparáveis; somar as
  fatias e citar o total desfaz exatamente a distinção que alguém teve o trabalho de construir.
  Antes de repetir um número agregado, olhe se ele vem rotulado e cite o rótulo junto — descobri
  que 61% de uma "economia" que eu havia registrado era estimativa contra uma constante
  escolhida, e o instrumento já dizia isso no envelope.

- **Documente o REPRODUTOR, não a medição.** Um número gravado em página estática (economia,
  cobertura, latência, contagem) começa correto e apodrece na semana seguinte, e quem o ler
  depois não tem como saber se está velho. Escreva o comando que produz o número; se a ocasião
  exigir o valor fixo (uma release, um relatório datado), publique-o COM a data e o comando ao
  lado, para que qualquer leitor possa reconferir em vez de acreditar.
- **Ledger vazio nem sempre é instrumento desligado — pode ser a arquitetura funcionando.** Antes
  de tratar um zero como falha de medição, confirme o que o desenho prevê: num modelo onde outra
  parte arca com o custo, custo zero É o resultado esperado e é a evidência que o requisito pede.
  O erro simétrico (ler o zero como defeito) desperdiça um ciclo caçando um bug que não existe.

- **Quando um envelope traz mais de um número com o mesmo nome, diga QUAL você está citando.**
  Relatórios costumam misturar o score do objeto medido com o score do próprio relatório
  (checks aprovados / total), e citar o errado inverte a conclusão: reportei uma qualidade como
  "abaixo da meta" quando o valor real era grade A — o número que li era a taxa de aprovação do
  gate. Antes de concluir a partir de um número, localize o campo exato que o produziu.
- **Um check com limiar correto e severidade errada é exatamente "medido e não cobrado".** Gates
  costumam separar `required` de `recommended`, e a decisão final olha só o primeiro — então um
  critério pode existir, exibir o valor certo no envelope e nunca reprovar nada. Ao verificar se
  um gate cobra algo, leia a SEVERIDADE do check e a regra que computa `ready`, não a presença do
  check. E, para promover um check a required com segurança, meça primeiro: se ele já passa hoje,
  a promoção é catraca; se não passa, você está bloqueando o time sem avisar.

- **Um gate multi-comando sem `set -e` reporta só o ÚLTIMO — teste quebrando o do MEIO.** Hooks e
  scripts que enfileiram verificações devolvem o exit code do último comando por padrão, então
  tudo que vem antes vira decoração e ninguém percebe, porque o gate "roda" e "passa". A
  sabotagem que revela isso é quebrar um comando intermediário; quebrar o último dá falso
  conforto. Vale para qualquer cadeia: hook, script de CI, pipeline com etapas.
- **Para ligar um gate sobre dívida existente, use CATRACA, não meta.** Quando o acervo já viola o
  critério (N avisos, cobertura abaixo do alvo), exigir a limpeza antes de ligar significa não
  ligar, e escolher um número redondo ou não morde ou bloqueia todo mundo. Fixe o limite na
  medição ATUAL: o que existe passa, o que for NOVO reprova. E quando a catraca pegar você
  mesmo, limpe o seu — afrouxá-la na primeira mordida é o mesmo que nunca tê-la posto.

- **Mudar o TIPO de um registro é afirmar algo sobre o mundo — rode o cobrador antes.** Reclassificar
  um requisito como `constraint` (ou uma task como `done`, ou um risco como `mitigado`) declara
  que a regra vigora, e o esquema empresta autoridade a essa declaração. Execute o gate, o hook ou
  o teste que supostamente a cobra e leia a saída: um tipo errado mente com mais força que um
  registro aberto, porque um aberto ao menos parece pendente. Earned: eu ia converter quatro
  requisitos em constraint e descobri que o hook cobrava metade do que eles exigiam.

- **Toda métrica de dívida tem um PISO onde o que resta não é mais dívida do mesmo tipo.** Um
  lote que cai rápido com um método (casar, wirar, arquivar) chega num resíduo cuja natureza é
  outra: critérios de gate que nenhuma task "implementa", itens já triados cujo desfecho correto
  é continuar abertos, artefatos de import. Insistir no método que funcionou até ali é como um
  mutirão honesto vira uma pilha de vínculos forjados. Quando o delta parar de bater com a
  intenção — ou quando você precisar argumentar para encaixar um item — pare, classifique o
  resíduo por natureza e devolva o que exige decisão de dono.

- **Procure o implementador no grafo INTEIRO, não só sob o mesmo pai.** Importadores de documento
  agrupam nós pela seção em que o texto aparecia (Requisitos / Riscos / Restrições), não pela
  relação real — então o épico de um requisito pode ter zero tasks enquanto as tasks que o
  entregaram vivem sob outro container do mesmo PRD. "Não há candidato no épico" quase nunca
  significa "ninguém implementou"; significa que a estrutura reflete o layout do documento
  original. Busque por conteúdo em todo o grafo antes de concluir que é dívida.

- **Case por CONTEÚDO, não por identificador — convenção de ID raramente é única.** Quando dois
  conjuntos parecem se corresponder por numeração (REQ-3 ↔ Epic 3, ticket-12 ↔ branch-12), o
  casamento por número produz pares errados com aparência de precisão, porque o mesmo número
  costuma existir em mais de uma origem. Case pelo título/descrição normalizada e IMPRIMA os dois
  lados antes de aplicar em lote; o número é dica de partida, nunca chave. Vi um script casar
  "A/B Lever Config" com "Hexagonal Consolidation" e reportar sucesso.

- **"Consertei e nada mudou" quase sempre significa que você editou o gêmeo.** Antes de duvidar
  do conserto, confirme que o símbolo que você tocou é o que roda: `grep -n` do nome costuma
  devolver duas definições no mesmo arquivo (uma legada, uma viva). O teste falhando E o efeito
  real ausente, juntos, são a assinatura disso — um bug real deixaria pelo menos um dos dois se
  mover.
- **Quando N linhas de um relatório erram do mesmo jeito, suspeite da REGRA antes de corrigir as
  linhas.** Um detector que classifica mal uma categoria inteira (um cabeçalho tratado como
  folha, um agrupamento como item) gera dívida que nenhuma edição de dado resolve — e "limpar"
  linha a linha costuma exigir apagar registro real. Conserte a classificação e verifique que as
  folhas legítimas continuam sendo cobradas; remover a cobrança impossível não pode remover o
  sinal.

## Anti-Patterns

- Do NOT plan/PRD here — consume the backlog; planning is `graph-backlog-generation`
- Do NOT write code before investigating — `rg`/`agf search` first; **expand, don't recreate**
- Do NOT break WIP=1 — one `in_progress` task at a time
- Do NOT mark done on a false claim — file a risk/task node for any loose end
- Do NOT claim savings a lever did not make — read the ledger (`agf metrics`)
- Do NOT skip the quality gates — `agf tdd-score` + `agf harness --violations` enforce SWE practices
- Do NOT mark done without `npm run test:blast` (standalone) + `agf check` green

## Economy

Output is compressed automatically with `--ai`; project with `--select <path>`;
recover the exact command with `agf retrieve-command "<intenção>"`; delegate with
`agf brief <id>`; reuse before you create. Opt-in levers via `agf economy on
<lever>` (`ncd_dedup`, `forage_stop`, `mdl_select`, `heat_kernel`,
`budget_kleiber`, `info_bottleneck`…); measure with `agf metrics --economy-report`
and `agf savings`. Reallocators reshape (saved≈0); cutters reduce input tokens.

**Route the call by cost (3rd pillar):** `agf provider use <id>` picks the gateway and
`agf model` / `--pin <model>` the tier — let the tier-router auto-pick (cheap→build→
frontier by task complexity) or pin a cheap model for mechanical work. Every call is
attributed per-node in the `llm_call_ledger`; `agf metrics --simulate` re-prices the
real bill under any model.

See `_shared.md` → **Token Economy** for the full arsenal: gateway auto-levers
(diff-edits, repo-map, lossy-gate, CCR), `agf economy list`, and the compress guardrail.

## Concurrent Multi-Agent Protocol (N ants, one graph — stigmergy)

Two or more agents ("ants") can share one SQLite graph using the claim/lease system.
Each ant sets a unique identity; the WIP guard becomes per-agent, not global. The
governing rule is stigmergic: the environment (statuses, leases, working tree) tells
you what to do — **an occupied trail means divert to another task; never freeze the
colony, never fight over the same node.**

### Setup — identity is mandatory in a shared graph

```bash
# Ant A (terminal 1)
export AGF_AGENT_ID=formiga-a

# Ant B (terminal 2)
export AGF_AGENT_ID=formiga-b
```

Alternatively, pass `--agent <id>` to `agf next` AND `agf done` (next claims, done
releases — both sides need the id). Priority: `--agent` flag > `AGF_AGENT_ID` env
var > auto-generated UUID. An ant operating WITHOUT identity gets single-agent
semantics — see the hijack gotcha below.

> **GOTCHA — `--agent` belongs ONLY on `next` and `done`; `agf node status` does
> NOT accept it and silently no-ops the transition when you pass it.** Running
> `agf node status <id> in_progress --agent <you>` returns a header but the status
> stays `backlog` (the unknown flag is swallowed, the mutation dropped) — you don't
> discover it until `agf done`/`check` fails the required `status_flow_valid` DoD
> check ("deve passar por in_progress"). Transition WITHOUT the flag:
> `agf node status <id> in_progress`. Ownership (`metadata.claimedBy`) is already
> written by `agf next --agent <you>`, so the plain transition is colony-safe — the
> id doesn't need to ride on `node status`. Prefer the env var (`export
AGF_AGENT_ID=<you>`) so identity flows to every command that honors it and you
> never hand `--agent` to one that doesn't.

### Claim lifecycle

```
agf next --agent formiga-a       # atomically claims a task; other ants skip it
  → claim: { agentId, leaseToken, expiresAt }

# … Ant A implements + TDD …

agf done <id> --agent formiga-a  # marks done + releases the lease
```

If an ant crashes mid-task, the lease TTL (default **5 min** — verified
`CLAIM_TTL_SECONDS = 300` in agent-claim-manager; the docs' old "30 min" was wrong)
auto-expires and the task becomes claimable again. Re-running `agf next --agent
<you>` re-claims/renews your own live task after a restart. Inspect live leases
with `agf claims`.

### Stigmergy rules (earned in real 2-ant sessions)

1. **The durable trail marker is `in_progress` status, not the lease.** The lease
   only guarantees pull-time atomicity; any real TDD task outlives 5 min. After it
   expires, the other ant's only protection is the `in_progress` status — treat it
   as pheromone: NEVER adopt a task in_progress that isn't yours, even when
   `agf claims` is empty. Live-ant signals: blast-file mtimes seconds old, a second
   agent process running, files appearing mid-investigation.
2. **Ownership lives on the node (`metadata.claimedBy`), written at claim.** A task
   in_progress owned by another ant is never handed out as `wip-idempotent` and is
   surfaced as `FOREIGN_WIP` in the pull envelope; only a LEGACY in_progress node
   with no owner still gets the old restart-recovery handoff — so identity remains
   mandatory: an id-less ant writes no ownership and gets no protection.
3. **Occupied trail ⇒ divert, don't stop.** Meeting the other ant mid-flight
   (wip-conflict, foreign in_progress, files changing under you) is not an error:
   leave that task alone, claim another with your id, keep the colony moving.
   Reserve STOP for: nothing claimable AND harvest dry, or an unsafe tree (rule 4).
4. **The shared working tree is coordinated by DECLARED FILE SCOPES — declare at
   claim, always.** (Same-tree is the light mode for 2-3 ants; at 4+, use
   worktree-per-ant — see **Scaling: worktree-per-ant** below. The old rejection
   of worktrees — "the gitignored graph.db doesn't travel" — was solved by the
   central graph root: every ant points at the SAME graph.) The declared boundary
   (implementationFiles + testFiles) does double duty: other ants' pulls skip
   candidates whose declared files overlap yours (even after your lease expires —
   the in_progress+owner status protects), and their done-gate excuses your declared
   dirty files instead of flagging them as scope creep. An UNDECLARED dirty file is
   an orphan: it still blocks every other ant's done by design. Never escape with
   `--force` (it skips tests); close (done + commit with explicit paths) promptly;
   never `git checkout --`/revert dirty files you didn't author — at most report
   them. If another ant's stash/pop sweeps the tree mid-run, a false RED or a
   false NO_FILES_MODIFIED can appear — before diagnosing a revert, check the
   file's mtime and grep for your symbol: stash-pop returns everything.
   **Integrating a moved remote with foreign dirty files:** `git pull --rebase`
   (and `--autostash`) refuses or stash-sweeps the other ant's files — use
   `git fetch` + `git merge origin/main` instead: merge tolerates dirty files
   that don't overlap the incoming diff (check with `git diff --name-only
HEAD origin/main` first), so the colony's tree is never swept.
5. **Support is free.** Your blast gate re-runs the other ant's affected tests: a
   green blast re-validates their trail at zero cost; a red one on THEIR files is a
   finding to deposit as a `risk` node — not a license to touch their code.
6. **Deposit trails for the colony.** Close each task with a pheromone memory
   naming the ant-protocol gotchas you hit, so the next ant skips the diagnosis
   you already paid for.

### Scaling: worktree-per-ant (4+ formigas)

Same-tree interference (done-gate reading the whole tree, one git index, blast
seeing foreign dirt, lint-staged auto-staging across ants) saturates useful
parallelism at ~3-5 ants. Past that, give each ant its own git worktree while
ALL ants share ONE central graph + memories:

```bash
agf ant spawn formiga-a     # cria <repo>-ants/formiga-a (branch ant/formiga-a),
                            # symlinka node_modules e devolve os exports prontos
cd <repo>-ants/formiga-a
export AGF_AGENT_ID=formiga-a AGF_GRAPH_ROOT=<repo raiz>   # (do envelope do spawn)
# … loop normal: next → TDD → done → commit na branch ant/formiga-a …
# fim de ciclo: merge p/ main → push → agf ant rm formiga-a (branch preservada)
```

Rules that change in this mode: the done-gate and blast see only YOUR worktree
(no foreign-dirt contortions); commits land on `ant/<id>` and merge to `main`
at cycle end (golden rule: no orphan branches — merge and delete same-session);
claims/leases/pheromones work unchanged because `AGF_GRAPH_ROOT` points every
ant at the same `workflow-graph/`. What does NOT travel into a worktree is
anything gitignored (node_modules — symlinked by spawn; local `.env`s — copy
manually if the task needs them). Env hygiene: git exports `GIT_DIR`/`GIT_INDEX_FILE`
inside hooks — any tool spawning `git` for ANOTHER repo/fixture must strip
inherited `GIT_*` env or it will silently operate on the parent repo.

### 2-ant runnable example

```bash
# Terminal 1
export AGF_AGENT_ID=formiga-a
agf next --agent formiga-a       # pulls task X, claims it

# Terminal 2 (concurrently)
export AGF_AGENT_ID=formiga-b
agf next --agent formiga-b       # pulls task Y (X is locked), claims it

# Both complete independently:
agf done <X-id> --agent formiga-a
agf done <Y-id> --agent formiga-b
```

### Override: --force

`agf next --force` bypasses the per-agent WIP=1 guard and pulls a second task
for the same agent, emitting a `WIP_OVERRIDE` warning. Use only in exceptional
circumstances (e.g. the prior task is blocked and cannot be done yet).

### The colony as a separate, installable orchestrator (delegate-first, opt-in)

The colony can be driven by a **second, separately-installable binary** that lives
in the SAME repo and reuses 100% of the core — never a rewrite. The point is
optionality: a heavy frontier model plans the backlog; a **cheap model executes** it,
task by task, routing each task's **complexity-caste → model-tier** (the smallest
caste runs on the cheapest tier). Two invariants make this safe to wire back into the
main loop:

> **Jurisprudência desta etapa** (casos reais, causa-raiz e o blind-spot que os produziu): [references/field-lessons.md](references/field-lessons.md) → seção "The colony as a separate, installable orchestrator (delegate-first, opt-in)". Carregue sob demanda.

- **Colony size is a parameter on the opt-in flag** — one ant = one worktree (the
  worktree-per-ant primitive above), all pointed at the same graph via the shared
  graph-root env. Sizing past ~3-5 is where worktree-per-ant (vs. same-tree) pays off.

## Related

- `graph-backlog-generation` — produces the PRD/backlog this loop consumes.
