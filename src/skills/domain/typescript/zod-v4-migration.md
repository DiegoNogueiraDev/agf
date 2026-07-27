---
domain: typescript
topic: zod-v4-migration
triggers: [zod_upgrade, schema_migration, type_inference_break]
discovered_at: 2026-04-28T00:00:00.000Z
source_task: seed
confidence: 0.82
---

# Zod v4 Migration

Always import from `zod/v4` in this project: `import { z } from 'zod/v4'`.
Never import from `zod` — that path resolves to v3 in some environments and
silently changes runtime behavior.

## Common breaks

- `z.record()` now requires both key and value schemas.
- `z.string().email()` was removed; use `z.email()` at the top level.
- `.optional()` followed by `.default()` changed evaluation order.
- `safeParse` errors expose `issues` (no longer `errors`).

## Migration recipe

1. Bulk replace `from "zod"` → `from "zod/v4"`.
2. Run `tsc --noEmit` and fix the schema-shape regressions case by case.
3. Re-run unit tests for each schema; runtime parsing is stricter in v4.
