---
name: ambiguity-audit
description: Classify each AC item as SPECIFIED / PARTIALLY / UNSPECIFIED before implementation; surface the alternatives you'd otherwise pick silently
category: analyze
phases: [ANALYZE, IMPLEMENT]
---

# ambiguity-audit

§EPIC-13.2 wraps `src/core/decisions/ambiguity-audit-types.ts`. Run this skill BEFORE writing any code so the unspecified items are escalated to the user instead of guessed at.

## When to use

- `agf start` returned a task with ≥ 3 acceptance criteria
- Any AC contains words like "appropriately", "good", "optimal", "if needed"
- You catch yourself about to make a design choice the AC didn't dictate

## Three-level classification

For every AC bullet, label it exactly one of:

| Label           | Meaning                                                                                                    | Action                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **SPECIFIED**   | The AC names a concrete observable outcome (input → output) with no judgement call                         | Implement directly                                                    |
| **PARTIALLY**   | The AC names the outcome but leaves at least one shape detail open (format, threshold, edge-case behavior) | Pick the most conservative option, document the choice in `rationale` |
| **UNSPECIFIED** | The AC requires a decision the user has not made (algorithm, UX, error handling)                           | List 2–3 alternatives and ASK before coding                           |

## Output shape (persist to `node.metadata.ambiguityAudit`)

```json
{
  "specified": ["AC1", "AC4"],
  "partial": ["AC2"],
  "unspecified": [
    { "item": "AC3", "alternatives": ["throw on duplicate", "upsert silently", "return existing record"] }
  ]
}
```

`agf done` reads this metadata and refuses to mark `done` if `unspecified.length > 0` and the parent has no follow-up decision node.

## Anti-patterns

- Marking everything SPECIFIED to skip the conversation — the audit is for YOU first
- Listing one alternative under UNSPECIFIED — "alternative" implies plural; if only one path exists, it's PARTIALLY at most
- Auditing after coding — by then the bias is locked in
