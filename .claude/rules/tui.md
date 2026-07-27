# TUI Components — agent-graph-flow

## Framework

Built with [Ink](https://github.com/vadimdemedes/ink) (React for terminals).
All TUI components live in `src/tui/` and are `.tsx` files.

## Component Rules

- Functional components only — no class components
- Use `useInput`, `useApp`, `useStdin` from `ink` for terminal interaction
- Keep components under 150 lines; extract sub-components for longer views
- No side effects in render — use `useEffect` for subscriptions and cleanup

## State Machines

Complex flows (skill execution, autopilot, swarm) use explicit state machines.
State lives in `useReducer`, not distributed `useState` calls.

## Skill Handler Port

Skills use the `SkillHandlerPort` interface (`src/tui/skill-handler-port.ts`).
A handler receives `SkillExecutionContext` — never import `SqliteStore` directly inside a handler.

## Output

TUI components write to stdout via Ink's rendering pipeline.
Never call `console.log` or `process.stdout.write` inside a component — it breaks Ink's alternate screen.

## Testing

TUI components are tested via snapshot or behavior tests with `ink-testing-library`.
Skill handlers are tested by calling `handler.execute(args, ctx)` with a mock `SkillExecutionContext`.
