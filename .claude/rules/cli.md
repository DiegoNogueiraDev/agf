# CLI Commands — agent-graph-flow

## Structure

Each `agf <command>` lives in `src/cli/commands/<command>-cmd.ts`.
One file per command. No command logic in shared helpers.

## Output Contract

Every command outputs a JSON envelope to stdout:

```typescript
{ ok: true, data: <payload>, meta: { command: string, ms: number } }
{ ok: false, status: 'fail', code: string, error: string, data?: unknown }
```

Never write raw text to stdout. `console.log` is banned — use `process.stdout.write` with the envelope.

## Store Access

Use `openStore(dir)` from `src/cli/open-store.ts`. Never instantiate `SqliteStore` directly in command files.

```typescript
const store = await openStore(opts.dir, { requireExisting: true })
```

## Flag Conventions

- `--dir / -d` — workspace directory (default: `process.cwd()`)
- `--json` — force JSON envelope output even when a human-readable format is the default
- `--select <path>` — dot-path filter on the output envelope's `data` field (token economy)
- `--limit <n>` — cap list outputs; default 20 for query commands

## --select Token Economy

Every command MUST respect `--select`. Implementation: after building the full `data` object, call `applySelect(data, opts.select)` before emitting. This is the primary token-reduction lever for agent callers.

## Error Codes

Use `SCREAMING_SNAKE_CASE` codes in `code` field:

- `NO_TASKS` — nothing unblocked to pull
- `NOT_FOUND` — node/edge not found
- `INVALID_TRANSITION` — status_flow violation
- `STORE_NOT_FOUND` — `requireExisting` failed

## Testing

CLI commands are integration-tested via `agf <cmd>` subprocess calls (E2E tier).
Unit-test pure helper functions extracted from commands, not the command entry points themselves.
