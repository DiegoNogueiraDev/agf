# Plugins — agent-graph-flow

## Plugin Contract

Every plugin lives under `src/plugins/<name>/` and exports a `PluginManifest` as its default export:

```typescript
export const manifest: PluginManifest = {
  name: 'my-plugin',
  version: '1.0.0',
  hooks: [...],
}
export default manifest
```

## Hook Registration

Plugins register handlers on named hook channels (see `agf hooks list` for all 28 channels).
A plugin must only register hooks on channels it owns — never monkey-patch existing handlers.

## Lifecycle

Plugins are loaded lazily at first use via the plugin registry (`src/plugins/plugin-registry.ts`).
They must be idempotent: loading the same plugin twice must not double-register hooks or duplicate state.

## Isolation

Plugins must not import from `src/cli/` or `src/tui/`. They may import from `src/core/` and `src/schemas/`.
Cross-plugin imports are forbidden — communicate via hook channels or shared graph nodes.

## Error Handling

Plugin errors must never crash the host process. Wrap all hook handlers in try/catch and emit a structured error event instead of propagating.

## Testing

Each plugin must have at least one test in `src/tests/<plugin-name>*.test.ts` covering:

- Manifest shape validation
- At least one hook handler with a mock event bus
