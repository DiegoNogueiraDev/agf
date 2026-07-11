---
name: citation-coverage-review
description: Verify every new core file has at least one §-citation traceable
category: review
phases: [REVIEW, HANDOFF]
---

# citation-coverage-review

## When to use

In PR review for any change touching src/core/. Citations anchor implementation back to design intent (EPIC, ADR, RFC).

## Steps

1. Manually verify every claim cites a real source (citation groundedness).
2. For each src/core/\*.ts in the diff lacking §-citation, request one in review.
3. Acceptable forms: `§EPIC-22.A4`, `§ADR-0049`, `RFC 7232 §2.3`.
4. Skip src/tests/, src/cli/, src/web/ (caller-side discipline only).
5. citation-coverage-guard hook (E21.T01) runs the check at task:post-complete; this skill is for human review depth.

## Anti-patterns

- Bulk-adding cosmetic §-tags that don't trace anywhere.
- Approving "no citation needed for utilities" when the utility encodes a real design choice.
- Ignoring the hook warning thinking "it's just advisory".
