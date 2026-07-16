# Hive Scorecard — agf HARDEN pillar, proven on a real third-party repo

**What this is:** proof that `agf` runs its quality gates on _foreign_ code — not just
its own — by pointing it at [`aden-hive/hive`](https://github.com/aden-hive/hive), a
YC-backed (Aden) production agent harness of **911 Python files**. Point-in-time
snapshot; re-run the commands below to reproduce.

## Reproduce (zero mutation to the hive repo)

```bash
# non-invasive: creates ONLY workflow-graph/ + a gitignore entry, no context files
agf init --graph-only --dir ../hive

agf harness    --dir ../hive
agf lint-files --dir ../hive
```

`--graph-only` is what makes this safe on a repo you don't own: it writes **no**
`AGENTS.md` / `.claude/` / `.cursor/` / `GEMINI.md` — only the local, gitignored graph DB.

## Result

| Signal                                      | Value     | Notes                                                                |
| ------------------------------------------- | --------- | -------------------------------------------------------------------- |
| `agf harness` grade                         | **A**     | ⚠️ Caveat below — measures the (empty) agf graph, not hive's source. |
| `agf lint-files` files scanned              | **998**   | source files across 25+ languages (repo-wide).                       |
| `agf lint-files` **oversized (>800 lines)** | **73**    | measured, not estimated — the real signal.                           |
| ceiling                                     | 800 lines | the same rule agf enforces on itself.                                |

### Top offenders (measured by `agf lint-files --dir ../hive`)

| Lines    | File                                                  |
| -------- | ----------------------------------------------------- |
| **4501** | `core/framework/agent_loop/agent_loop.py`             |
| 4193     | `core/framework/tools/queen_lifecycle_tools.py`       |
| 3124     | `tools/src/gcu/browser/bridge.py`                     |
| 3109     | `tools/src/aden_tools/tools/slack_tool/slack_tool.py` |
| 2834     | `core/framework/llm/litellm.py`                       |

## The point

Hive's own `AGENTS.md` says: _"Keep files reasonably small when practical; split or
refactor large files instead of growing them indefinitely."_ That is a **guideline they
document but do not enforce** — so **73 files** blew past a reasonable ceiling, the
worst at **5.6×** it. `agf lint-files` turns that same intent into a **deterministic,
zero-token gate** (wired into a git pre-commit hook + CI), catching what manual
discipline misses. The value agf adds is not "have a rule" — it's "**enforce the rule
by a trigger, not by remembering**."

## Honest caveats

- The **`agf harness` grade (A) is not a verdict on hive's code**. Harness scores the
  agf _graph_ (types/tests/provenance of tracked nodes); on a `--graph-only` repo the
  graph is empty, so it defaults high. The meaningful, code-grounded signal here is
  **`lint-files` (73 real violations)**, not the harness grade.
- Numbers are a point-in-time snapshot (hive `main`, 911 py files at capture). Re-run
  the commands above to refresh; they are fully deterministic (~0 LLM tokens).
