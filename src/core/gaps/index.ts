/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Gap detector registry. Each detector is a pure, deterministic function over
 * the GraphDocument (zero LLM, zero tokens). Milestones append their detector to
 * {@link GAP_DETECTORS} in display order; `agf gaps` and `agf gate` both run them.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap, GapKind } from './gap-types.js'
import { detectTraceability } from './detect-traceability.js'
import { detectAcCoverage } from './detect-ac-coverage.js'
import { detectWeakAc } from './detect-weak-ac.js'
import { detectAmbiguity } from './detect-ambiguity.js'
import { detectAtomicity } from './detect-atomicity.js'
import { detectNfr } from './detect-nfr.js'
import { detectEdgeCases } from './detect-edge-cases.js'
import { detectDesignDrift } from './detect-design-drift.js'
import { detectEstimateDrift } from './detect-estimate-drift.js'
import { detectBlockingContainer } from './detect-blocking-container.js'
import { detectStaleContainer } from './detect-stale-container.js'
import { detectDuplicatePrd } from './detect-duplicate-prd.js'
import { detectPhantomDone, type FileExistsPort } from './detect-phantom-done.js'
import { detectPhantomPointer } from './detect-phantom-pointer.js'
import { detectDriverBoundary, type DriverBoundaryProbe } from './detect-driver-boundary.js'
import { detectContractCoverage } from './detect-contract-coverage.js'
import { detectOrphanCommit, type CommitProbe } from './detect-orphan-commit.js'

export * from './gap-types.js'
export * from './format.js'
export * from './completeness-events.js'

/** A deterministic gap detector over the graph. */
export type GapDetector = (doc: GraphDocument) => Gap[]

/** All registered detectors, in display order. M1+ append here. */
export const GAP_DETECTORS: GapDetector[] = [
  detectTraceability, // M1
  detectAcCoverage, // M2
  detectWeakAc, // M3
  detectAmbiguity, // M6
  detectAtomicity, // M7
  detectNfr, // M4
  detectEdgeCases, // M5
  detectDesignDrift, // M8
  detectEstimateDrift, // M9
  detectBlockingContainer, // M10
  detectStaleContainer, // M11
  detectDuplicatePrd, // M12
  detectContractCoverage, // contract_coverage (node_05cf12fa1679)
]

/**
 * Options for {@link detectAllGaps}. The graph-only detectors need nothing; the
 * `phantom_done` triangulation detector needs a filesystem probe — injected here
 * so it only runs when a surface (gaps-cmd) supplies one. Omitting `fileExists`
 * keeps the legacy graph-only behaviour byte-identical (retrocompat for the 4
 * existing callers).
 */
export interface DetectGapsOptions {
  fileExists?: FileExistsPort
  /** Probe config×ledger p/ o kind driver_boundary_missing — só roda quando a superfície fornece. */
  driverBoundary?: DriverBoundaryProbe
  /** Commits recentes p/ o detector orphan_commit — janela e coleta são do chamador. */
  commitProbe?: CommitProbe
}

/** Run every detector (optionally filtered by kind). Deterministic, ~0 token. */
export function detectAllGaps(doc: GraphDocument, kinds?: readonly GapKind[], opts?: DetectGapsOptions): Gap[] {
  const gaps = GAP_DETECTORS.flatMap((d) => d(doc))
  if (opts?.fileExists) {
    gaps.push(...detectPhantomDone(doc, opts.fileExists))
    gaps.push(...detectPhantomPointer(doc, opts.fileExists))
  }
  if (opts?.driverBoundary) gaps.push(...detectDriverBoundary(opts.driverBoundary))
  if (opts?.commitProbe) gaps.push(...detectOrphanCommit(doc, opts.commitProbe))
  return kinds && kinds.length > 0 ? gaps.filter((g) => kinds.includes(g.kind)) : gaps
}
