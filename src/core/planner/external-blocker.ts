/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * External/infra blocker triage.
 *
 * The graph already has a `blocked` boolean, but it cannot tell WHY a node is
 * stuck: an unresolved *code* dependency (another task must finish first) reads
 * the same as an *external/infra* blocker (proxy, K8s access, Vault secret, SSH
 * push) that needs a human outside the repo. That ambiguity is why autonomous
 * loops infer "harvest exhausted" in prose instead of surfacing it
 * deterministically.
 *
 * This module classifies a blocked node as `code` vs `external`, enumerates the
 * external ones (so the loop can queue the human action instead of fabricating
 * work), and enforces the honesty invariant that an external-blocked node is
 * never marked done. Pure — no I/O, no graph mutation.
 */

export type BlockerKind = 'code' | 'external'

/** Minimal node shape needed to reason about blockers. */
export interface BlockNodeLike {
  id: string
  title: string
  status: string
  blocked?: boolean
  tags?: string[]
  description?: string
  metadata?: Record<string, unknown>
}

/** One externally-blocked node awaiting a human/infra action. */
export interface ExternalBlock {
  nodeId: string
  title: string
  /** The signal that classified it as external (matched phrase or reason). */
  reason: string
  /** What unblocks it — always outside the repo. */
  requiredAction: string
}

/**
 * Signals that a block is external/infra rather than a code dependency.
 * Sourced from real agf session output: corporate proxy, K8s cluster access,
 * Azure DevOps repo, Vault secret provisioning, SSH push failures.
 */
export const EXTERNAL_BLOCKER_PATTERNS: RegExp[] = [
  /\bproxy\b/i,
  /\bnetwork\b/i,
  /\bfirewall\b/i,
  /\bvpn\b/i,
  /\bnexus\b/i,
  /\bk8s\b/i,
  /\bkubernetes\b/i,
  /\bcluster\s+access\b/i,
  /\bvault\b/i,
  /\bsecret[s]?\s+provisioning\b/i,
  /\bcredential[s]?\b/i,
  /\bazure\s+devops\b/i,
  /\bssh\b/i,
  /\bpush\s+(?:blocked|failed|timeout)\b/i,
  /\bprovisioning\b/i,
  /\brate\s*limit\b/i,
  /\bquota\b/i,
]

const REQUIRED_ACTION = 'human/infra action outside the repo'

/** Free-text a classifier scans: explicit reason first, then node text. */
function blockerText(node: BlockNodeLike): string {
  const meta = node.metadata ?? {}
  const reason = typeof meta['blockReason'] === 'string' ? meta['blockReason'] : ''
  return [reason, node.title, node.description ?? '', (node.tags ?? []).join(' ')].join(' ')
}

/** The first external signal found in the node's text, if any. */
function matchedSignal(node: BlockNodeLike): string | null {
  const text = blockerText(node)
  for (const pattern of EXTERNAL_BLOCKER_PATTERNS) {
    const m = pattern.exec(text)
    if (m) return m[0]
  }
  return null
}

/**
 * Classify a blocked node as `code` or `external`. Returns `null` when the node
 * is not blocked at all. An explicit `metadata.blockerKind` always wins.
 */
export function classifyBlocker(node: BlockNodeLike): BlockerKind | null {
  if (!node.blocked) return null

  const kind = node.metadata?.['blockerKind']
  if (kind === 'external' || kind === 'code') return kind

  return matchedSignal(node) ? 'external' : 'code'
}

/**
 * List the externally-blocked nodes, each with the signal that classified it
 * and the human action required. Feeds the "harvest exhausted" surface.
 */
export function enumerateExternalBlocks(nodes: readonly BlockNodeLike[]): ExternalBlock[] {
  const blocks: ExternalBlock[] = []
  for (const node of nodes) {
    if (classifyBlocker(node) !== 'external') continue
    const meta = node.metadata ?? {}
    const explicit = typeof meta['blockReason'] === 'string' ? (meta['blockReason'] as string) : ''
    const reason = explicit || matchedSignal(node) || 'external dependency'
    blocks.push({ nodeId: node.id, title: node.title, reason, requiredAction: REQUIRED_ACTION })
  }
  return blocks
}

/**
 * Honesty invariant: an externally-blocked node must never be marked done —
 * the work is gated on infra/human action the repo cannot perform. Returns
 * false only for a done transition on an external-blocked node.
 */
export function isHonestDoneTransition(node: BlockNodeLike, toStatus: string): boolean {
  if (toStatus !== 'done') return true
  return classifyBlocker(node) !== 'external'
}
