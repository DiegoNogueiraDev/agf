---
name: deep-module-review
description: Audit a module's depth ratio + interface surface before merge
category: review
phases: [REVIEW]
---

# deep-module-review

## When to use

In code review of a new module or significant change. Goal: keep modules deep (small interface, large impl) per Ousterhout.

## Steps

1. Run `agf harness`.
2. Reject any new file with depth='shallow' (ratio > 0.5) unless intentional facade.
3. For 'medium', ask: can any export be made internal? Does any import only need one symbol?
4. Check: function names describe behavior, not implementation.
5. Block merge if shallowCandidates > 0 without justification in PR description.

## Anti-patterns

- Approving "looks fine" without running the analyzer.
- Letting test helpers leak into production exports because they're "small".
- Accepting helper modules with 10 exports — usually a bag of utilities, not a module.
