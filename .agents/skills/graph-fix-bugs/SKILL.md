---
name: graph-fix-bugs
description: Structured bug fix workflow using Root Cause Analysis (5 Whys), Reproduce-Fix-Verify cycle, TDD for bugs, and regression prevention
triggers:
  - graph-fix-bugs
version: 2.0.0
author: Diego Nogueira
date: 2026-06-21
---

> 💡 **The `agf` CLI is the whole interface — zero MCP.** The lifecycle is `agf start` → TDD → `agf done <id>`
> (pipeline), or `agf next` → `agf context <id>` → TDD → `agf check <id>` → `agf node status <id> done` (granular).

# graph-fix-bugs

Structured bug fix workflow using Root Cause Analysis (5 Whys), Reproduce-Fix-Verify cycle, TDD for bugs, and regression prevention. Every bug fix follows a disciplined process that prevents recurrence.

See also: `[[effective-debugging]]`, `[[feathers-legacy-code]]`

## When to Use

- When a bug is identified (from graph-bug-hunter, user report, or test failure)
- During IMPLEMENT phase for bug-fix tasks
- When a regression is detected after a deployment or merge

## Mandatory Flow

```
select bug → start_task → reproduce (RED) → 5 Whys → impact analysis → fix (GREEN) → regression suite → verify → prevent → finish_task → write_memory
```

## Workflow

### Step 1: Bug Selection

```bash
agf query --type bug --status backlog --limit 20 --select data.nodes   # what is open
agf risk triage                                                        # unconfirmed risks first
agf node status <bug_node_id> in_progress                              # WIP=1: claim exactly one
```

No node, no fix. If the bug you are about to fix has no node, open it: `agf node add --type bug`.

### Step 2: Reproduce (TDD RED)

Write a test that reproduces the bug. The test MUST fail. If it passes, the bug description is wrong or already fixed.

```bash
npx vitest run src/tests/bug-fix-<description>.test.ts
```

### Step 3: Root Cause Analysis (5 Whys with Verification Discipline)

Each "why" must be **falsifiable** — you must be able to verify it before moving to the next. Never assume; confirm.

| Level | Question                           | Evidence Required                            |
| ----- | ---------------------------------- | -------------------------------------------- |
| Why 1 | Why does X fail?                   | Log, error message, or test output           |
| Why 2 | Why does Y cause X?                | Code path trace or debugger confirmation     |
| Why 3 | Why does Z produce Y?              | Reproducer that isolates Z alone             |
| Why 4 | Why does W trigger Z?              | Specific input/state that triggers W         |
| Why 5 | What is the root structural cause? | Design/code decision that made this possible |

Rule: if you cannot produce evidence for a "why", it is a hypothesis — mark it as such and design an experiment to confirm it (see `[[effective-debugging]]` — Scientific Method, Item 1).

Document the verified chain in the bug node description.

### Step 4: Impact Analysis

```bash
agf code impact <file> <affected_symbol>   # blast radius before you touch anything
agf code affected <file>                   # which test files already cover it
```

Determine: how many modules depend on the buggy code, whether the fix will break callers, and whether the same pattern exists at other call sites.

### Step 5: Fix Implementation (TDD GREEN)

Write the minimal fix to make the failing test pass.

- Do NOT refactor during fix — keep the change as small as possible
- Do NOT add features — fix only the bug
- Do NOT change unrelated code — minimize the diff

```bash
npx vitest run src/tests/bug-fix-<description>.test.ts
```

### Step 6: Regression Suite

```bash
npm test
```

Zero regressions allowed. If any test breaks, the fix is too broad — narrow it down.

### Step 7: Fix Verification Criteria

"Tests pass" is necessary but not sufficient. Verify all four:

1. **Similar paths** — Are there other code paths that exercise the same logic? Check them manually or with targeted tests.
2. **Edge cases** — What happens at boundaries (empty, null, max, concurrent)? The bug's root cause often implies more than one vulnerable input.
3. **Related code review** — Does the blast radius analysis reveal other modules with the same pattern? Fix the class of bug, not just the instance (effective-debugging Item 21).
4. **AC validation** — Confirm the original user-reported behavior is resolved.

```bash
agf verify-ac <bug_node_id>   # is the AC actually satisfied by the code now on disk?
agf check <bug_node_id>       # Definition of Done + TDD adherence
```

### Step 8: TDD Bug Fix Cycle (Complete)

```
1. Write failing test  →  npx vitest run <bug-test>   # RED confirmed
2. Make minimal fix
3. Run bug test        →  npx vitest run <bug-test>   # GREEN confirmed
4. Run full suite      →  npm test                    # No regressions
5. Verify AC           →  agf check <id>
6. Add test to CI      →  test file committed with fix
```

The test must be committed alongside the fix so the CI pipeline catches any future regression.

### Step 9: Regression Prevention Matrix

| Bug Category                                     | Test Type to Add                           | Coverage Target                            |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Logic error (wrong condition, off-by-one)        | Unit test with boundary inputs             | 100% branch for that function              |
| Timing / async (race condition, stale state)     | Integration test with concurrency probe    | At least one concurrent execution scenario |
| Configuration / environment                      | Smoke test with config variations          | All required env vars validated at startup |
| Data shape (null, missing field, wrong type)     | Unit test with null/empty/malformed inputs | Each shape variant tested                  |
| Integration contract (API changed, schema drift) | Integration test against real contract     | Contract snapshot in CI                    |
| UI state (wrong render, stale prop)              | Component test asserting state transitions | Full user interaction sequence             |

### Step 10: Prevention & Close

Document the bug pattern:

```bash
agf memory write pheromone-fix-<slug> --content "<root cause + fix + the gotcha>"
```

Include: root cause (5 Whys chain), symptoms, fix approach, prevention strategy. Write the gotcha, not
just the fix — the next hunt reads this to skip the dead end you already walked.

```bash
npm run test:blast          # mandatory gate before done
agf done <bug_node_id>      # DoD, epic promotion, pheromone deposit
```

## Anti-Patterns

- Do NOT fix without reproducing first — write the failing test before touching production code
- Do NOT skip evidence at each Why level — unverified Whys are guesses, not root causes
- Do NOT fix multiple bugs in one commit — one bug, one fix, one commit
- Do NOT refactor during bug fix — separate commits for fix and refactor
- Do NOT skip 5 Whys — surface-level fixes recur within weeks
- Do NOT ignore blast radius — fixes can introduce new bugs in dependent modules
- Do NOT skip regression suite — run ALL tests, not just the bug test
- Do NOT close without documenting prevention — the team needs to learn from every bug

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
