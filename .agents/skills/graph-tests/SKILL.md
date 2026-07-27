---
name: graph-tests
description: Test strategy audit using Test Pyramid, FIRST principles, coverage analysis, and test quality assessment
triggers:
  - graph-tests
version: 2.0.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-tests

Test strategy audit using Test Pyramid, FIRST principles, coverage analysis, and test quality assessment. Identifies gaps in test coverage, validates pyramid shape, ensures TDD discipline, and applies canonical test double and smell detection from Khorikov, Meszaros, and Freeman & Pryce.

## When to Use

- After IMPLEMENT phase, to audit test quality before VALIDATE
- During VALIDATE phase, as part of comprehensive quality checks
- When test coverage is insufficient or declining
- Before major releases to ensure test confidence
- When onboarding new modules that lack test coverage

## Mandatory Flow

```
npm test --> coverage report --> pyramid check --> FIRST audit --> test double audit --> smell scan --> missing tests --> test quality --> edge cases --> report --> write_memory
```

## Workflow

### Step 1: Test Suite Gate

Run the full test suite. All tests must pass with zero failures.

```bash
npm test
```

If any test fails, STOP. Fix failures before proceeding. Never audit quality on a broken suite.

**Fast inner-loop gate (agf ≥ 0.20.0):** `agf test --blast` selects tests by **code-impact radius** — it walks the module graph from your uncommitted changes and runs only the transitively-affected tests. When nothing changed it takes a **no-op fast path** (no test process spawned). Use it during RED/GREEN iteration and at the `agf done` task gate; reserve the full `npm test` for the PR gate.

### Step 2: Coverage Report

```bash
npm run test:coverage
```

**Thresholds:**

- Statements: 70% | Branches: 65% | Functions: 70% | Lines: 70%

Report all files below threshold. Identify the top 5 modules with lowest coverage as priority targets.

### Step 3: Test Pyramid Check

Count tests by type to verify pyramid shape:

- **Unit tests:** `src/tests/*.test.ts` without database/store dependencies
- **Integration tests:** Tests using `SqliteStore`, in-memory database, or cross-module interactions
- **E2E tests:** `src/tests/e2e/*.test.ts` (Playwright browser tests)

**Healthy ratio target:** ~70% unit, ~20% integration, ~10% E2E.

Flag inverted pyramids where integration or E2E tests outnumber unit tests.

### Step 4: FIRST Scoring Rubric

Score each principle 0–100. Overall FIRST score = average.

| Principle           | Criteria for 100                                                                                             | Deductions                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Fast**            | Every test < 1s; no `sleep`/`setTimeout`; no network calls                                                   | −20 per test > 1s; −30 for network I/O                        |
| **Independent**     | Each test creates its own store/state; `beforeEach` resets; no shared mutable variables                      | −25 per shared-state leak found                               |
| **Repeatable**      | Same result on every machine/run; no reliance on external services or file system; no `Date.now()` hardcoded | −30 for flaky test found                                      |
| **Self-validating** | Clear assertions with descriptive messages; no console inspection needed; test passes = green, fails = red   | −20 for undescribed assertion; −30 for "manual check" comment |
| **Timely**          | Test exists in the same commit as the feature (TDD); no untested public functions in recently modified files | −10 per public function added without a corresponding test    |

Score each principle 0–100. Overall FIRST score = average.

### Step 5: Test Double Decision Matrix

When code under test needs a collaborator, choose the right double (Meszaros taxonomy):

| Double    | When to use                                                                                           | Assert on it?                |
| --------- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Dummy** | Parameter required but never used by the test's behavior                                              | No                           |
| **Stub**  | SUT needs a return value from a dependency (query); you don't care whether the call happened          | No — never                   |
| **Spy**   | You want to assert _after the fact_ that a call occurred, without upfront expectations                | Yes — in the Assert phase    |
| **Mock**  | You need pre-programmed expectations on _outgoing commands_; failure if call doesn't happen           | Yes — verified automatically |
| **Fake**  | You need a real working implementation (e.g., `:memory:` SQLite) without the real infrastructure cost | No                           |

**Decision rule (Khorikov):** Only mock **unmanaged dependencies** — services your application doesn't own and whose interactions are visible externally (SMTP, message bus, third-party APIs). Use real implementations (Fake/in-memory) for **managed dependencies** (SQLite store, in-process DB). Never mock intra-system calls between domain classes — those are implementation details.

**For this project:** Prefer `Fake` (`:memory:` SQLite via `SqliteStore`) for store tests. Use `Stub` for external API responses. Reserve `Mock` for verifying outgoing MCP tool calls.

### Step 6: Test Smell Catalog

Scan test files for these smells (Meszaros) and flag each one:

| Smell                      | Detection signal                                                               | Fix                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Assertion Roulette**     | Multiple assertions, none with messages; when one fails you can't tell which   | One behavior per test, or add assertion messages                                         |
| **Mystery Guest**          | Test reads from a file, global, or preset DB row not declared in the test body | Move setup inline or into a named Creation Method                                        |
| **Obscure Test**           | Hard to understand the scenario in under 10 seconds                            | Inline the relevant context; use a Test Data Builder                                     |
| **Eager Test**             | One test exercises 3+ distinct behaviors                                       | Split into single-behavior tests                                                         |
| **Erratic Test**           | Passes sometimes, fails other times (flaky)                                    | Fresh Fixture; remove shared mutable state; eliminate `Date.now()` hardcoding            |
| **Fragile Test**           | Breaks when production code is refactored but behavior is unchanged            | Stop testing implementation details; test through public API only                        |
| **Interacting Tests**      | One test's side effect corrupts the next                                       | `beforeEach` reset; Transaction Rollback or fresh `:memory:` DB per test                 |
| **Hard-Coded Test Data**   | Literal magic values with no context (`42`, `"abc"`, `user1`)                  | Named constants or factory helpers from `src/tests/helpers/factories.ts`                 |
| **Overspecified Software** | Mocks have expectations on every method call, including queries                | `allowing(...)` for queries; `oneOf(...)` / `Verify` only for the one command under test |

### Step 7: London vs Classical School

Apply the right school per object type (Khorikov + GOOS):

| Object type                                               | School        | Strategy                                                |
| --------------------------------------------------------- | ------------- | ------------------------------------------------------- |
| Pure function / domain logic                              | **Classical** | No mocks; assert on return value                        |
| Domain object with state                                  | **Classical** | Assert on state after act                               |
| Orchestrator (application service) calling unmanaged deps | **London**    | Mock the external boundary; assert the command was sent |
| Orchestrator calling managed deps (SQLite store)          | **Classical** | Use real in-memory store (Fake)                         |

**Decision rule:** If you'd write `expect(result).toBe(...)` on a return value → Classical. If correct behavior IS "it called X on Y with these args" → London. Never use London school for intra-system calls between domain classes.

### Step 8: Missing Test Detection

For each modified `.ts` file in `src/core/` and `src/mcp/`, check if a corresponding `.test.ts` exists in `src/tests/`.

```bash
agf tdd-score <id>          # 0–100: coverage, assertion diversity, test density
agf verify-ac <id>          # is the AC already satisfied by code that exists?
agf check <id>              # Definition of Done, including TDD adherence
```

List all public exported functions without corresponding test assertions.

### Step 9: Test Quality Check

- **AAA structure:** Each test has exactly one Arrange / one Act / one Assert block (blank lines between). Act section = exactly one line — if two lines are needed, fix the SUT's API.
- **No `if` in tests:** An `if` = two behaviors. Split the test.
- **Minimal mocks:** Prefer real instances (`:memory:` SQLite, temp files) over mocks for store tests.
- **Factory helpers:** Use `makeNode`, `makeEdge` from `src/tests/helpers/factories.ts`.
- **Descriptive names:** Plain English facts about behavior, not implementation (`returns_next_unblocked_task_sorted_by_priority`, not `getTask_validInput_returnsTask`).
- **No test pollution:** Proper `beforeEach`/`afterEach` cleanup; no leaked state.
- **Single behavior focus:** Each test verifies one coherent outcome.

### Step 10: Edge Case Coverage

For each function under test, verify coverage of:

- **Happy path:** Normal input → expected output
- **Error paths:** Invalid input, null, undefined, empty strings
- **Boundary conditions:** 0, −1, MAX_SAFE_INTEGER, empty arrays, single-element arrays
- **Async error handling:** Rejected promises, timeout scenarios, concurrent access
- **Type edge cases:** Optional fields missing, extra fields present

### Step 11: Test Report

```
Test Suite: <N> tests, <N> passed, <N> failed
Coverage: statements <N>%, branches <N>%, functions <N>%, lines <N>%
Pyramid: unit <N> / integration <N> / e2e <N> (ratio: <X>:<Y>:<Z>)
FIRST Score: <N>/100 (F:<N> I:<N> R:<N> S:<N> T:<N>)
Test Smells: <N> found — [list by type]
Test Double Issues: <N> violations (over-mocked managed deps, stub assertions)
Gaps: <N> modules without tests
Grade: <A-F>
```

**Grading:**

- **A (90–100):** All thresholds met, pyramid correct, FIRST > 80, no smells, no double violations
- **B (75–89):** Minor gaps, pyramid slightly off, FIRST > 65, ≤ 2 smells
- **C (60–74):** Coverage below threshold in some areas, pyramid inverted for some types
- **D (45–59):** Significant gaps, FIRST < 50, many smells, managed deps mocked
- **F (< 45):** Critical test debt, broken pyramid, widespread quality issues

Save findings:

```
agf memory write test-audit-<date> --content "<report>"
```

## Anti-Patterns

- Do NOT skip running the full test suite — a passing suite is the baseline for any audit
- Do NOT mock what you can use in-memory — prefer `:memory:` SQLite over mocks for store tests
- Do NOT assert on stubs — stub assertions (verifying that a query was called) are overspecification and produce false positives
- Do NOT mock intra-system calls between domain classes — these are implementation details; test state or return values instead
- Do NOT write tests after implementation — TDD first, always
- Do NOT use shared mutable state between tests — each test owns its state
- Do NOT ignore flaky tests — fix the root cause (Fresh Fixture, seed isolation, clock injection)
- Do NOT test implementation details — test behavior through the public API contract
- Do NOT skip edge cases for "happy path only" coverage — edge cases catch real bugs
- Do NOT put `if` statements in tests — split into separate test cases

## Key Takeaways

1. **FIRST score** measures test health numerically — use the rubric per-principle, not as a gut feeling.
2. **Test doubles:** Dummy (ignored), Stub (query input, never assert), Spy (recorded calls), Mock (command expectation), Fake (working lightweight impl). Pick based on whether you need a return value (Stub/Fake) or to verify a call happened (Mock/Spy). ([[meszaros-xunit-patterns]])
3. **Mock boundary:** Only mock unmanaged dependencies (SMTP, external APIs). Use real in-memory implementations for managed ones (SQLite store). Never mock intra-system class interactions. ([[khorikov-unit-testing]])
4. **Test smells are design signals:** Fragile tests → over-specification; Erratic tests → shared state; Mystery Guest → missing inline setup; Assertion Roulette → too many behaviors per test. ([[meszaros-xunit-patterns]])
5. **School selection:** Classical (pure functions, value objects, domain logic). London (application service → external boundary). Both styles coexist in the same codebase. ([[khorikov-unit-testing]], [[goos-tdd]])
6. **AAA is non-negotiable:** One Arrange, one Act (one line), one Assert block. A two-line Act reveals a broken SUT API. An `if` in a test means two tests are needed.
7. **Test pain = design signal:** Hard-to-test code reveals missing interfaces, overloaded responsibilities, or hidden dependencies. Fix the production code, not the test. ([[goos-tdd]])

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
