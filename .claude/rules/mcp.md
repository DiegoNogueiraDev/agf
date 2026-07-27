# MCP Server — agent-graph-flow

## Role

`src/mcp/` is the optional MCP surface — it wraps core graph operations as MCP tools.
The primary interface is the `agf` CLI. MCP is an opt-in bridge, not the authority.

## Tool Registration

Each MCP tool is registered in `src/mcp/server.ts`. Tools must:

- Accept a strongly-typed Zod input schema
- Return a JSON-serialisable result
- Never hold mutable state — each call is stateless from the MCP perspective

## Delegation Pattern

MCP tools delegate to `src/core/` functions — they must not duplicate logic.

```typescript
server.tool('graph_next', nextInputSchema, async (input) => {
  const store = openStoreForMcp(input.dir)
  return findNextTask(store.toGraphDocument())
})
```

## Error Handling

Return structured errors via the MCP error protocol. Never throw raw errors from tool handlers.

## Zero MCP Requirement

`agf` commands must function with `--no-mcp`. MCP is a transport layer, not a dependency.
Core logic must never import from `src/mcp/`.

## Testing

MCP tools are tested via the CLI E2E tier, not by unit-testing the MCP wiring.
If a tool has non-trivial logic, extract it to `src/core/` and test there.
