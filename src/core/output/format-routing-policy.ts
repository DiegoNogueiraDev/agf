/*!
 * format-routing-policy — select output format by consumer × intent × size.
 *
 * WHY: Different consumers need different output formats. Agent consumers need
 * machine-parseable JSON; human consumers need rich readable output. A policy
 * table makes this deterministic and testable (no ad-hoc if/else scattered
 * across commands). Extends the profiles/output layer (profiles.ts) with a
 * routing layer that pre-selects the format before profile resolution.
 *
 * Pure function — no I/O.
 */

export type ConsumerType = 'human' | 'agent-next' | 'agent-code' | 'agent-generic'
export type OutputFormat = 'json' | 'rich' | 'compact'
export type SizeHint = 'small' | 'medium' | 'large'

export interface FormatRoutingInput {
  consumer: ConsumerType
  intent: string
  sizeHint: SizeHint
}

export interface FormatRoutingResult {
  format: OutputFormat
  /** Reason string for diagnostics/logging. */
  reason: string
}

/**
 * Policy table: consumer → default format.
 * Agent consumers always want JSON (machine-parseable);
 * human consumers always want rich (readable).
 */
const CONSUMER_FORMAT_TABLE: Record<ConsumerType, OutputFormat> = {
  'agent-next': 'json',
  'agent-code': 'json',
  'agent-generic': 'json',
  human: 'rich',
}

/**
 * Route the output format for a given consumer, intent, and size hint.
 * The policy is a deterministic lookup table — no heuristics.
 */
export function routeOutputFormat(input: FormatRoutingInput): FormatRoutingResult {
  const format = CONSUMER_FORMAT_TABLE[input.consumer]
  return {
    format,
    reason: `consumer=${input.consumer} → ${format} (policy table)`,
  }
}
