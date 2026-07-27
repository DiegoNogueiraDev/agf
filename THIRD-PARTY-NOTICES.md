# Third-Party Notices

`agent-graph-flow` (agf) is distributed under the Apache License 2.0 (see `LICENSE`).

It incorporates portions of the third-party open-source projects listed below. Each
listed project is governed by its own licence, which is not superseded by the Apache
License 2.0 — a permissive licence permits the code to be distributed _inside_ this
work, but it does not relicense that code. The copyright of each upstream author is
retained, here and in the header of every affected file.

This file is verified by `scripts/check-public-hygiene.mjs`: every upstream named in a
source file must appear below, and every entry below must name the files it covers. A
missing entry fails CI. Attribution is a gate, not a promise.

**Not listed here** are projects that agf merely _interoperates_ with at runtime (the
Serena MCP server, Tesseract OCR, document converters on `PATH`). agf ships none of
their code, so no notice is owed — naming them in source is interoperability, the same
as naming SQLite or Node.js.

---

## 1. rtk — the tool-output compression engine (original)

- **Project:** rtk
- **Upstream:** https://github.com/rtk-ai/rtk
- **Licence:** Apache License 2.0
- **Copyright:** Patrick Szymkowiak

The architecture of agf's tool-output compression (autodetect → filter → pipeline) and
its engine constants (`RAW_CAP`, `MIN_COMPRESS_SIZE`, `DETECT_WINDOW`, the git-diff hunk
caps) originate in this project's Rust implementation (`src/core/stream.rs`,
`src/core/filter.rs`).

agf did not derive from rtk directly — it derived from a JavaScript port of it (entry 2).
rtk is credited here as the origin of the work, so that agf's attribution stands on its
own regardless of any intermediate project's compliance.

**agf files derived from this lineage:** `src/core/tool-compress/**` (31 files).

Note: agf's _filter definitions_ (`src/core/economy/tool-filters/filters/*.toml`, 79
files) are independent work. They share no content with rtk's 58 TOML filters — a
different schema (`[[filters]]` + `detect` + `pipeline` versus `[filters.<name>]` +
`match_command`), different regexes, and no test corpus in common.

## 2. 9router — the JavaScript port of the above

- **Project:** 9router
- **Upstream:** https://github.com/decolua/9router
- **Licence:** MIT
- **Copyright:** © 2024-2026 decolua and contributors

agf's `src/core/tool-compress/` is a TypeScript port of this project's
`open-sse/rtk/` module. The correspondence is direct and file-for-file:
`applyFilter`, `autodetect`, `constants`, `registry`, `index`, and the filters
`buildOutput`, `dedupLog`, `find`, `gitDiff`, `gitStatus`, `grep`, `ls`,
`readNumbered`, `searchList`, `smartTruncate`, `tree`.

That module is itself labelled `// RTK port constants (mirror Rust defaults)` upstream —
hence entry 1.

**agf files:** `src/core/tool-compress/**` (31 files), which carry `SPDX-License-Identifier: MIT`.

## 3. mempalace — memory wake-up layers and AAAK index compression

- **Project:** mempalace
- **Upstream:** https://github.com/MemPalace/mempalace
- **Licence:** MIT
- **Copyright:** © 2026 MemPalace Contributors

Ported from Python.

**agf files:**

- `src/core/economy/aaak-compressor.ts` — AAAK index-compression dialect
- `src/core/economy/wake-up.ts` — L0–L3 orchestrator
- `src/core/economy/wake-up-l0.ts` — L0 Identity layer
- `src/core/economy/wake-up-l1.ts` — L1 Essential layer
- `src/core/economy/wake-up-l2-l3.ts` — L2 On-Demand + L3 Deep Search layers

## 4. agentmemory — reciprocal-rank fusion and retention

- **Project:** agentmemory
- **Upstream:** https://github.com/rohitg00/agentmemory
- **Licence:** Apache License 2.0

The upstream ships no `NOTICE` file, so there is none to propagate under Apache-2.0 §4(d).

**agf files:** `src/core/economy/rrf.ts`, `src/core/economy/retention.ts`.

## 5. codegraph — adaptive skeletonization and sibling detection

- **Project:** codegraph
- **Upstream:** https://github.com/colbymchenry/codegraph
- **Licence:** MIT
- **Copyright:** © 2026 Colby Mchenry

**agf files:** `src/core/analyzer/adaptive-skeletonizer.ts`,
`src/core/analyzer/polymorphic-sibling-detector.ts`.

## 6. claw-code — recovery recipes, policy engine, session compaction

- **Project:** claw-code
- **Upstream:** https://github.com/ultraworkers/claw-code
- **Licence:** MIT
- **Copyright:** © 2026 UltraWorkers and Claw Code contributors

`recovery-recipes.ts` ports the seven failure scenarios from `recovery_recipes.rs`.
The remaining files mirror an on-disk contract or an enum shape rather than copying
expression; they are listed for completeness and honesty, not because a licence
obliges it.

**agf files:** `src/core/autonomy/recovery-recipes.ts` (port),
`src/schemas/session-compaction.schema.ts` (approach),
`src/schemas/policy-engine.schema.ts` (approach),
`src/core/worker-state/worker-state-schema.ts` (contract),
`src/tui/components/PluginHealth.tsx` (enum shape),
`src/tui/components/output-streaming.ts`.

## 7. OpenAI Codex — skill-description truncation, collaboration modes

- **Project:** OpenAI Codex
- **Upstream:** https://github.com/openai/codex
- **Licence:** Apache License 2.0
- **Copyright:** © 2025 OpenAI

Upstream `NOTICE`, propagated per Apache-2.0 §4(d):

> OpenAI Codex
> Copyright 2025 OpenAI
>
> This project includes code derived from [Ratatui](https://github.com/ratatui/ratatui),
> licensed under the MIT license.
> Copyright (c) 2016-2022 Florian Dehau
> Copyright (c) 2023-2025 The Ratatui Developers

**agf files:** `src/tui/skill-budget.ts` (from `core-skills/src/render.rs`),
`src/core/agent-driver/collaboration-mode.ts` (from `collaboration-mode-templates/`).

## 8. opencode — compaction summary template

- **Project:** opencode
- **Licence:** MIT
- **Copyright:** © 2025 opencode

**agf files:** `src/core/context/compact-template.ts`.

## 9. browser-harness — agent helper loading

- **Project:** browser-harness
- **Upstream:** https://github.com/browser-use/browser-harness
- **Licence:** MIT
- **Copyright:** © 2026 Browser Use

**agf files:** `src/tui/workbench.ts` (from `agent_helpers.py`, `_load_agent_helpers()`).

## 10. surface-skill — deterministic output-format decision engine

- **Project:** surface-skill
- **Upstream:** https://github.com/DiegoNogueiraDev/surface-skill
- **Licence:** MIT
- **Copyright:** © 2026 Diego Nogueira

Authored by the same person as agf, but published separately under MIT. Listed because a
separate licence still governs it: shared authorship is not a shared licence.

**agf files:** `src/tui/surface-decide.ts` (from `scripts/decide.ts`, `policy.yaml`).

---

## Unresolved

`src/core/context/rule-compressor.ts` carries the header `Adapted from context-hub
compression patterns`. No project by that name exists in this workspace, and the header
does not name a licence. Until the upstream is identified and its licence confirmed, this
file must not be treated as cleared. It is listed here so the gap is visible rather than
silently inherited.
