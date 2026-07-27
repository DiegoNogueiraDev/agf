/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Provenance — epistemic confidence ladder over knowledge nodes.
 * Ported incrementally from graph-flow/core/provenance.
 */

export { promoteTier, MissingEvidenceError, InvalidCitationError, InvalidTestRunError } from './tier-promotion.js'
export type {
  EpistemicTier,
  PromotionEvidence,
  PromotionInput,
  PromotionEvent,
  PromotionResult,
} from './tier-promotion.js'

export {
  downgradeTier,
  canAdvanceToHandoff,
  InvalidDowngradeError,
  EmptyCauseError,
  DowngradeBlockedError,
} from './tier-downgrade.js'
export type { DowngradeInput, DowngradeEvent, DowngradeResult, HandoffGateInput } from './tier-downgrade.js'

export { computeTierDistribution, groupNodesByTier, isLowMaturityEpic } from './epistemic-mix.js'
export type { TierNode, TierDistribution, GroupedByTier } from './epistemic-mix.js'

export { hashNodeCanonical, canonicalSerialize } from './canonical-hasher.js'

export { writeSource, supersedesSource, ProvenanceError } from './source-immutability.js'
export type { SourceStore } from './source-immutability.js'
