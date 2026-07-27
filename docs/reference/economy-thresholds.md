# Economy Lever Thresholds

All numeric thresholds for the opt-in bio/math token-economy levers.
Source of truth: `src/core/economy/economy-levers-config.ts` — `LEVER_DEFAULTS`.
`agf economy list` reads from `LEVER_DEFAULTS` at runtime, so this table reflects the current source values.

| Lever             | Parameter               | Default Value | Phase/Context                                                         |
| ----------------- | ----------------------- | ------------- | --------------------------------------------------------------------- |
| `heat_kernel`     | `t`                     | `0.5`         | IMPLEMENT — diffusion time for heat-kernel context ranking            |
| `heat_kernel`     | `seedWeight`            | `0.5`         | IMPLEMENT — relevance influence on gain (0–1)                         |
| `mdl_select`      | `retrievalPenaltyBytes` | `24`          | All phases — min saved bytes to justify a retrieval round-trip        |
| `mdl_select`      | `homogeneityThreshold`  | `0.9`         | All phases — fraction of elements matching the ref key set            |
| `mdl_select`      | `jsonMinCompress`       | `256`         | All phases — min bytes for JSON array SmartCrusher compression        |
| `mdl_select`      | `codeAstMin`            | `512`         | IMPLEMENT — min bytes for AST code compression (CODE_AST_MIN)         |
| `info_bottleneck` | `beta`                  | `2`           | IMPLEMENT — fidelity weight vs token savings (higher = more fidelity) |
| `forage_stop`     | `minItems`              | `1`           | IMPLEMENT — minimum items to keep in context (MVT floor)              |
| `forage_stop`     | `epsilon`               | `0`           | IMPLEMENT — epsilon-greedy exploration probability (0 = pure exploit) |
| `ncd_dedup`       | `threshold`             | `0.3`         | All phases — NCD similarity threshold for near-duplicate detection    |
| `stigmergy`       | `halfLifeMs`            | `604800000`   | LISTENING — pheromone trail half-life (7 days in ms)                  |
| `stigmergy`       | `epsilon`               | `0.001`       | LISTENING — minimum trail strength to consider                        |
| `stigmergy`       | `trailLimit`            | `5`           | LISTENING — top N trails to return                                    |
| `consolidation`   | `downscale`             | `0.5`         | HANDOFF — multiplicative downscale for memory traces                  |
| `consolidation`   | `floor`                 | `0`           | HANDOFF — salience floor                                              |
| `consolidation`   | `mergeThreshold`        | `0.3`         | HANDOFF — NCD threshold for merging similar traces                    |

Levers with no configurable thresholds (`budget_kleiber`, `zipf_estimate`, `context_diff`, `quorum_gate`) use hardcoded math with no user-tunable parameters.

## Usage

```bash
# See live threshold values for all levers
agf economy list

# Override a threshold for a lever
agf economy param mdl_select codeAstMin 1024

# Reset to defaults by removing the param
agf economy param mdl_select codeAstMin 512
```
