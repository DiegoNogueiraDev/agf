## Pilot Protocol

**Entry:** `agf start` (wake-up + next + context + mark in_progress)

**Loop:**

```
agf next                      # pull next unblocked task (WIP=1)
agf brief <id>                # compact spec ≤ 500 tokens
# → implement with TDD (Red→Green→Refactor)
agf check <id>                # DoD validation (12 checks)
agf submit <id> --result '{"arquivos":["<file>"],"testes":{"passed":N,"failed":0},"desvios":[],"usage":{"tokens_in":N,"tokens_out":N,"model":"<model>"}}'
```

**Exit conditions:**

- `agf check <id>` → `ready: true` + all required checks pass
- No unblocked tasks remain (`agf next` → empty)
- Budget exceeded or escalation required

**Token targets:**

- `agf brief` output ≤ 500 tokens
- Simple tasks (S/XS): use cheap tier (Haiku 4.6)
- Complex tasks (M/L): build tier (Sonnet 4.6)
- Report via `usage` field in `agf submit` for ledger tracking

**Quality gate:**

- DoD score ≥ 60 (grade B) before `agf done`
- `npm run test:blast` green before submit
- AC coverage: each AC must have a corresponding test
