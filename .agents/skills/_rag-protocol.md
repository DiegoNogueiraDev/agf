# RAG Protocol — CLI-First Token Economy

All `agf` commands self-optimize under AI agents. 14+ agents auto-detected
(Claude Code, Copilot, OpenCode, Codex, Cursor, Aider, Windsurf, Antigravity,
Amazon Q, Gemini, Continue, Tabby, Warp, Codeium).

- **No flags needed:** CLI auto-detects agent and enables `--ai` mode
- **Command lookup:** `agf retrieve-command "<intention>"`
- **Output:** Always JSON envelope — parse the `data` field
- **Composition:** `agf exec pipe` / `agf exec chain` instead of shell pipes
- **Compression:** `agf compress` for foreign tool output (reversible via CCR)
- **Measure:** `agf savings` · `agf metrics` · `agf calibrate`

## Retrieval is a suggestion, not an oracle

The corpus indexes the **whole** CLI surface — every command and subcommand, generated from the
live commander tree. So a skill never needs to carry a command catalogue: ask, and it is there
to be found. What retrieval cannot promise is that it found the _right_ one.

Read the envelope, not just the command:

1. **`decision: "fallback_help"` means `command` is `null`.** The engine scored below its own
   gate and is telling you so. Take `fallback` and run `--help`. Do **not** dig into
   `candidates` for a better-looking guess — those are the options it already rejected.
2. **`decision: "retrieved"` still deserves one check** — `agf <cmd> --help` — before a command
   with side effects. Ranking is lexical; it cannot tell _showing_ a node from _archiving_ one.
3. **A destructive command is refused unless you asked to destroy.** `node rm`, `gc`, `prune`,
   `--force`, `--reset` come back as a fallback when the intent was read-shaped. If you meant
   it, say so in the intent.

The failure to avoid: an agent trusts the retrieval, invents the flag that would make it
work, and reports success on a command that never ran.

## RAG-OUT: reuse the shape before you write one

`agf montar-output "<objetivo>"` answers `recover` with a `scaffold` and its `slots`, or
`generate` when nothing fits. **Fill the slots — do not rewrite the skeleton.** Output is the
expensive half of the bill; a recovered scaffold is output the model never had to produce, and
`data.economy.saved` is the receipt.

`generate` is an answer, not a failure: forcing a near-miss scaffold costs more than a blank
page, because a slot-filled wrong shape is harder to notice. Each scaffold declares its own
`noveltyFloor` for exactly this.

## Every saving names its baseline

`agf savings` reports `baselineMethods`, not one number. Read it before quoting the total.

- `measured_fallback` — counted from this machine's history: the tokens `agf help` really emitted,
  which is the path a successful retrieval avoided. Falsifiable: `agf help | wc -c`.
- `structural` — a constant someone chose, kept for a machine that has never run help.

`attribution` splits the same total by owner: a lever that fires while a task is `in_progress`
belongs to it; one that fires with nothing in progress belongs to nothing, and that is what a
benchmark looks like. **Never quote `totalSaved` alone** — an estimate with no method beside it
is read as a measurement, and an unowned total cannot be audited.
