# Schemas — agent-graph-flow

## Location

All Zod schemas live in `src/schemas/`. One file per domain concept.
Infer TypeScript types from schemas — never define types separately:

```typescript
import { z } from 'zod'
export const nodeSchema = z.object({ id: z.string(), title: z.string() })
export type GraphNode = z.infer<typeof nodeSchema>
```

## Boundary Validation

Use schemas at every external boundary:

- CLI flag parsing (`parseCliArgs`)
- MCP tool input
- File/JSON imports (`importPrd`, `importGraph`)
- LLM response parsing

Internal function calls between modules do NOT need re-validation.

## Schema Design

- Use `.describe()` on every field — schemas double as documentation
- Use `.default()` for optional fields with sensible defaults
- Prefer `z.discriminatedUnion` over `z.union` for better error messages
- Use `z.coerce.number()` for CLI args that arrive as strings

## Versioning

When a schema changes in a breaking way, bump a `schemaVersion` literal field.
Old versions must remain parseable for at least one minor release.

## Testing

Every schema in `src/schemas/` must have a corresponding test file in `src/tests/`.
Test: valid input parses, required fields missing → throws, wrong type → throws.
