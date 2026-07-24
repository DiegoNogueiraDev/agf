---
name: code-detachment
description: Don't hand-edit AI mistakes — explain via prompt and let the AI fix
category: any
phases: [IMPLEMENT, REVIEW]
---

# code-detachment

## When to use

When the agent produced wrong code. The instinct is to "just fix it" by hand. Resist — that re-creates an error pattern the agent will repeat.

## Steps

1. Diagnose: which assumption did the agent get wrong?
2. Write a prompt that names the wrong assumption and the right one (concretely).
3. Let the agent retry. Compare the new output to the wrong one to validate fix.
4. If the same class of mistake recurs ≥ 3 times, document the pattern in CLAUDE.md or add a feedback memory.
5. Hand-edit only when the cost of the round-trip exceeds the value of the lesson.

## Anti-patterns

- Silent hand-fixes that hide the failure pattern.
- Detailed prompts that re-explain the entire codebase — only the wrong assumption.
- Treating CLAUDE.md as immutable; it's an evolving spec.
