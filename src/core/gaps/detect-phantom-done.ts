/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * detect-phantom-done — the anti-hallucination triangulation detector.
 *
 * WHY: the graph is self-reported by the executor. A task can be marked `done`
 * with `testFiles: ['x.test.ts']` that points at a file which does NOT exist on
 * disk — the graph claims a delivery no real test backs. Every other gap
 * detector here reasons purely over the graph; NONE crosses status × the
 * filesystem. This one does: it is the physical leg of the AC↔code↔test
 * triangulation. If the test file isn't on disk, the work is not implemented —
 * status `done` is a hallucination (golden rule of anti-hallucination).
 *
 * Filesystem access is injected as a {@link FileExistsPort} (DIP) so the core
 * stays pure and testable with a stub; the surface (gaps-cmd) wires `existsSync`.
 *
 * Scope: audits `done` tasks that DECLARE testFiles and/or implementationFiles.
 * Both axes are crossed against the filesystem — the test leg AND the code leg
 * of the AC↔code↔test triangulation, all physical. A done task that declares
 * neither is a separate, weaker DoD concern (has_test_files), not a phantom.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'

/** Injectable filesystem probe: true iff the path exists on disk. */
export type FileExistsPort = (path: string) => boolean

/**
 * The physical leg of the triangulation: which of the declared files do NOT
 * exist on disk. Generic over test files and implementation files. Shared by
 * {@link detectPhantomDone} (audit) and the `agf done` gate (enforcement on
 * entry) so both apply the identical rule (DRY).
 */
export function missingFiles(files: readonly string[], fileExists: FileExistsPort): string[] {
  return files.filter((f) => !fileExists(f))
}

export function detectPhantomDone(doc: GraphDocument, fileExists: FileExistsPort): Gap[] {
  const gaps: Gap[] = []
  for (const node of doc.nodes) {
    if (node.status !== 'done') continue
    // Cross BOTH axes against the filesystem: declared tests AND declared source.
    const declared = [...(node.testFiles ?? []), ...(node.implementationFiles ?? [])]
    if (declared.length === 0) continue

    const missing = missingFiles(declared, fileExists)
    if (missing.length === 0) continue

    gaps.push({
      kind: 'phantom_done',
      severity: 'required',
      nodeId: node.id,
      evidence: `Task ${node.id} está 'done' mas declara arquivo(s) inexistente(s) no disco: ${missing.join(', ')} — entrega não comprovada (alucinação AC↔código↔teste)`,
      enrichment: {
        action: 'annotate',
        instruction: `Crie o(s) arquivo(s) ausente(s) (${missing.join(', ')}) e prove a entrega, OU reabra a task ${node.id} / corrija a referência (agf node update ${node.id} --test-files|--implementation-files). Status 'done' sem código+teste físico é alucinação.`,
        applyVia: [`agf node status ${node.id} in_progress`],
      },
    })
  }
  return gaps
}
