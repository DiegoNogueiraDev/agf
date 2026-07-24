# Coding Style — agent-graph-flow

## Stack

TypeScript ESM, Node.js 20+. All imports use `.js` extension (ESM resolution).
`"type": "module"` in package.json. Prefer `node:` prefix for built-in imports.

## TypeScript

- `strict: true` — no `any` in application code; use `unknown` and narrow
- Explicit return types on all exported functions
- Zod schemas for external boundary validation; infer types from schemas
- Named exports preferred over default exports

## Immutability

Never mutate existing objects — spread or reconstruct:

```typescript
// WRONG
obj.field = value
// CORRECT
const updated = { ...obj, field: value }
```

## Error Handling

- Wrap raw throws in typed error classes (`GraphError`, `ProviderError`, etc.)
- Never swallow errors in catch blocks — log or re-throw
- User-facing messages are distinct from internal error context

## File Organization

- Max 800 lines per file; extract helpers when approaching limit
- Organize by feature/domain (e.g. `core/gaps/`, `core/llm/`)
- One concern per file; avoid barrel files that re-export everything

## CLI Commands

Each `agf <command>` lives in `src/cli/commands/<command>-cmd.ts`.
Output always as `{ ok: true, data: ..., meta: { command, ms } }` JSON envelope.

## Testing

- Test files in `src/tests/*.test.ts`; filename stem must match source module basename exactly (case-sensitive)
- Use `vitest` with `describe`/`it`/`expect`
- Pure functions: test directly; DB/FS: use `new Database(':memory:')`
- Blast gate: `npm run test:blast` — mandatory before `agf done`
