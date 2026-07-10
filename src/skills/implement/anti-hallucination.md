---
name: anti-hallucination
description: Forbidden phrases + citation requirements for code and rationale
category: implement
phases: [IMPLEMENT, REVIEW]
---

# anti-hallucination

## When to use

Always — when writing comments, commit messages, PR descriptions, or rationale strings. Per `.claude/rules/anti-hallucination.md`.

## Steps

1. Re-read the change before commit. Search for forbidden phrases:
   "standard practice", "typically", "obviously", "best practice",
   "as expected", "common pattern", "generally", "normally".
2. Replace each with a citation (`§EPIC-...`, `§ADR-...`, RFC) or a measurement.
3. If you can't cite, the claim is probably wrong — delete it.
4. Add §-citations to any new file in src/core/.
5. Manually verify every claim cites a real source (citation groundedness) before `agf done`.

## Anti-patterns

- Hedging ("I think this is fine") instead of citing.
- Decorative §-tags that don't actually trace to a spec.
- Ignoring the linter when it flags banned phrases — fix, don't suppress.
