# Repomix Investigation — understand a project fast, find its weak & strong areas

The planner's lens on **Surface B (the code)**. Repomix packs the repo into one
deterministic, AI-friendly map (~0 LLM tokens to _produce_). The goal here is **not**
to read the whole codebase — it is to extract signal cheaply: where the value, the
debt, the bugs, and the dormant code live, so the backlog is grounded in reality.

> Run `repomix --help` for the live flag set (this catalog can drift). Secret scan is
> ON by default — never pack with `--no-security-check`. **Repomix is an optional
> external tool** — if it is not installed, fall back to the `agf` graph-map +
> `agf search` / `grep -rn` over `src` (Surface A is always available).

## Golden path: understand a project in 3 cheap passes

```bash
# 1) SHAPE — the map without the contents (fast, tiny): dir tree + per-file token counts
repomix --no-files --token-count-tree 200
#    → big numbers = complexity/debt hotspots; the tree shows how the project is organized.

# 2) STRUCTURE — Tree-sitter skeleton (classes/functions/interfaces only), no bodies
repomix --compress --remove-comments --stdout --include "src/**" -o -
#    → reads like an API surface of the whole repo at a fraction of the tokens.

# 3) MOTION — what's changing and what's uncommitted (where the action/risk is)
repomix --include-diffs --include-logs --include-logs-count 30 --stdout
#    → recent churn + WIP from other agents → trajectory and don't-duplicate signal.
```

Three passes ≈ understanding without ingesting every file. Drill into a single
subsystem only after the map tells you which one matters.

## Detect STRONG vs WEAK areas (the signal the planner needs)

| Signal you want                          | How repomix surfaces it                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Complexity / debt hotspots** (weak)    | `repomix --no-files --token-count-tree 300` → largest files (>800 lines ≈ SRP/debt risk)     |
| **Bug-prone files** (weak)               | default sorts **most-changed-first** (git frequency) — top of the map = defect concentration |
| **Top-N biggest files** (weak)           | `repomix --top-files-len 25` → ranked size summary                                           |
| **Missing pieces / gaps** (weak)         | read `--compress` structure: absent error paths, no tests beside a module, thin interfaces   |
| **Dormant features** (EXPAND targets)    | `--compress` shows exported-but-unwired symbols → highest-ROI white space                    |
| **Well-covered / stable areas** (strong) | low churn + tests present + small files → leave alone, don't re-plan                         |
| **Untracked/secret leakage** (risk)      | default security scan flags API keys/passwords before they enter the backlog                 |
| **Where churn ≠ tests** (fragile)        | cross the change-sorted list against test presence in the tree → fragile zones               |

Each weak finding becomes a grounded task with file pointers; strong areas justify
_not_ planning work there (Lean: no overproduction).

## Scope to a subsystem (drill down without the rest)

```bash
repomix --include "src/<area>/**,src/<other-area>/**"   # only these areas
repomix -i "**/*.test.ts,docs/**,**/*.snap"               # exclude noise
repomix --include "src/**" --compress --remove-empty-lines --stdout   # lean structure of src only
repomix --stdin < filelist.txt                            # pack an exact file list (e.g. from agf/grep output)
```

`--include` / `-i` accept comma-separated globs. Combine with `--compress` to read a
subsystem's shape in seconds. `--no-gitignore` / `--no-default-patterns` only when you
deliberately need normally-ignored files.

## Git-aware analysis (history & diffs as planning input)

```bash
repomix --include-logs --include-logs-count 50   # commit history (messages + changed files) → trajectory
repomix --include-diffs                          # working-tree + staged diffs → current WIP
# default: --git-sort-by-changes (most-changed first). Disable with --no-git-sort-by-changes.
```

## Output shaping (token economy of the map itself)

```bash
repomix --compress                 # structure only (Tree-sitter) — the biggest token saver
repomix --remove-comments          # drop comments
repomix --remove-empty-lines       # drop blank lines
repomix --truncate-base64          # shorten embedded base64 blobs
repomix --no-file-summary --no-directory-structure   # bare files only
repomix --style markdown|json|xml|plain              # default xml; json for programmatic parsing
repomix --token-count-encoding o200k_base            # tokenizer (GPT-4o default)
repomix --token-budget 50000       # FAIL (non-zero exit) if the map exceeds N tokens — CI/agent guard
repomix --output-show-line-numbers # line numbers (handy for citing file:line in tasks)
repomix --split-output 500kb       # split a huge map into numbered parts
repomix -o map.xml                 # write to a file (default repomix-output.xml); "-" = stdout
repomix --copy                     # also copy output to clipboard
```

## Remote research (skeleton-first — golden rule)

```bash
repomix --remote <user/repo>                       # pack a GitHub repo (or full URL)
repomix --remote <user/repo> --remote-branch <tag> # specific branch/tag/commit
```

Use BEFORE writing net-new: find a proven implementation to port/adapt rather than
recreate. `--remote-trust-config` loads the remote's repomix config (off by default
for security — only enable for repos you trust).

## Config & MCP

```bash
repomix --init [--global]          # scaffold repomix.config.json (repeatable scopes/ignores)
repomix -c <path>                  # use a custom config
repomix --mcp                      # run as an MCP server for tool integration
```

When the repomix **MCP** is connected, the same capabilities are available as tools —
`pack_codebase` / `pack_remote_repository` (produce the map), `grep_repomix_output`
(regex-search the packed map for a symbol/pattern without re-reading files), and
`read_repomix_output` (page through it). Prefer `grep_repomix_output` for targeted
"does X exist / where is Y" questions — it's the cheapest way to confirm white space.

## Anti-patterns

- Do NOT pack the whole repo with full file contents just to "look around" — start
  with `--no-files`/`--compress`; ingest bodies only for the one area that matters.
- Do NOT `--no-security-check` — a leaked secret must surface as a `risk` node, not ship.
- Do NOT plan work in low-churn, well-tested, small-file areas without a real driver
  (Lean): strong areas are signal to leave them alone.
- Do NOT treat the map as the source of truth for _status_ — that's the graph; repomix
  tells you what the code _is_, `agf` tells you what's _planned/done_.
