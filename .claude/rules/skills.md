# Skills — agent-graph-flow

## Structure

Skills live in `src/skills/<phase>/<skill-name>.ts`.
Each skill exports a class implementing `SkillHandlerPort`.

## Handler Contract

```typescript
export class MySkillHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    // return human-readable string output
  }
}
```

`SkillExecutionContext` provides: `store` (SqliteStore), `dir` (workspace path), `onProgress` (streaming callback).

## Progress Reporting

Call `ctx.onProgress({ step, total, label, elapsedMs, tokensUsed })` at each meaningful step.
Never do long silent stretches — report progress every ~500ms of work.

## No LLM in Skill Handlers

Skill handlers are deterministic. LLM calls happen in the TUI orchestration layer, not in handlers.
Handlers read the graph, compute, and format results — zero tokens spent.

## Output Format

Return a multi-line string suitable for terminal display. Use Unicode box-drawing for section headers:
`═ /skill-name ═` at top, `═ elapsed ═` at bottom.

## Naming

- Skill files: `kebab-case.ts`
- Handler classes: `PascalCaseHandler`
- `/slash-command` name matches the filename stem exactly

## Testing

Test via `handler.execute(args, mockCtx)` where `mockCtx` uses `new SqliteStore(':memory:')`.
Assert on the returned string for key phrases, not exact output.
