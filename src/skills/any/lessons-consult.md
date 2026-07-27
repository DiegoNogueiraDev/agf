---
name: lessons-consult
description: Query lessons_learned at `agf start` to avoid re-walking known failures
category: any
phases: [IMPLEMENT, ANALYZE]
---

# lessons-consult

## When to use

At `agf start`, automatically — the lessons-consultant (E22.D5) injects up to 3 most relevant past lessons into modelHint context. Use this skill when investigating manually.

## Steps

1. After loading task context, search lessons via `consultLessons(db, nodeText, 3)`.
2. For each high-confidence lesson (≥ 0.85), surface the recommendedAction.
3. If the lesson recommends `skip-similar` and the current task pattern matches, escalate to approval before continuing.
4. After completion, update applied_count via `persistLesson` (UPSERT).
5. Periodically prune lessons with applied_count = 1 and age > 90d (decayed).

## Anti-patterns

- Ignoring lessons because "this task is different" without comparing patterns.
- Recording new lessons that duplicate existing ones (UPSERT handles this).
- Letting lesson confidence stay frozen — re-grade on contradicting evidence.
