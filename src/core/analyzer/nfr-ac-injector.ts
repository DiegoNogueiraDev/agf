/*!
 * NFR AC injector — generates measurable NFR AC stubs for `agf ac nfr <id> --kind`.
 * Task node_6599c9e6ad44.
 *
 * WHY: When a node triggers a missing_nfr gap, the conducting agent needs a
 * concrete, measurable AC stub it can inject via `agf node update --ac` to
 * close the gap. Reuses NFR_EXAMPLE from nfr-detector.ts as the source of
 * truth for measurable templates.
 * Pure, ~0 token.
 *
 * Composes with: nfr-detector.ts (NfrCategory, NFR_EXAMPLE), ac-cmd.ts.
 */

import { NFR_EXAMPLE, type NfrCategory } from './nfr-detector.js'
import { ValidationError } from '../utils/errors.js'

export type NfrKind = NfrCategory | 'perf' | 'security' | 'a11y' | 'reliability' | 'scalability'

/** Alias map: short CLI flags → canonical NfrCategory. */
const ALIAS: Record<string, NfrCategory> = {
  perf: 'performance',
  performance: 'performance',
  security: 'security',
  a11y: 'accessibility',
  accessibility: 'accessibility',
  reliability: 'reliability',
  scalability: 'scalability',
}

export interface NfrAcResult {
  nodeId: string
  kind: NfrCategory
  acText: string
  applyVia: string
}

/**
 * Generate a measurable NFR AC stub for the given node and kind.
 * The acText is a Given-When-Then adaptation of the NFR_EXAMPLE template.
 * Throws on unknown kind.
 */
export function injectNfrAc(nodeId: string, kind: string): NfrAcResult {
  const canonical = ALIAS[kind.toLowerCase()]
  if (!canonical) {
    throw new ValidationError(`Unknown NFR kind "${kind}". Valid: ${Object.keys(ALIAS).join(', ')}`, [])
  }
  const template = NFR_EXAMPLE[canonical]
  const acText = `Given a produção estável, When medido, Then ${template}`
  return {
    nodeId,
    kind: canonical,
    acText,
    applyVia: `agf node update ${nodeId} --ac "${acText}"`,
  }
}
