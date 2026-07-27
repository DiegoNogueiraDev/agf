/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * detect-phantom-pointer — the dead-pointer detector for plan-time tasks.
 *
 * WHY: a task in the backlog says "EXPAND src/core/X.ts" but the file does not
 * exist on disk. The graph will expect the executor to deliver it — but the
 * referenced path is a dead pointer. Unlike phantom_done (which audits PAST
 * deliveries), this detector audits FUTURE work: backlog/ready tasks that
 * promise EXPAND pointers to non-existent files. Severity is RECOMMENDED (not
 * required) because a greenfield task legitimately points at files that don't
 * exist yet — the signal is "confirm this is intentional", not "you lied".
 *
 * Scope: audits backlog and ready tasks only (phantom_done covers done).
 * Only the `description` field is scanned — testFiles and implementationFiles
 * are FUTURE files by design and are NEVER flagged.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import type { FileExistsPort } from './detect-phantom-done.js'

/** Regex capturing src/ paths after an EXPAND marker in descriptions. */
const EXPAND_RE = /EXPAND\s+(src\/\S+)/g

export function detectPhantomPointer(doc: GraphDocument, fileExists: FileExistsPort): Gap[] {
  const gaps: Gap[] = []
  for (const node of doc.nodes) {
    if (node.status !== 'backlog' && node.status !== 'ready') continue
    if (!node.description) continue

    const matches = [...node.description.matchAll(EXPAND_RE)]
    if (matches.length === 0) continue

    const paths = matches.map((m) => m[1])
    const missing = paths.filter((p) => !fileExists(p))
    if (missing.length === 0) continue

    gaps.push({
      kind: 'phantom_pointer',
      severity: 'recommended',
      nodeId: node.id,
      evidence: `Task ${node.id} (${node.status}) declara EXPAND pointer(s) para arquivo(s) inexistente(s): ${missing.join(', ')}`,
      enrichment: {
        action: 'annotate',
        instruction: `Corrija ou crie o(s) arquivo(s) apontado(s) por EXPAND na task ${node.id}: ${missing.join(', ')}. Se o arquivo for legítimo (greenfield), crie-o; se o pointer estiver errado, corrija a descrição.`,
        applyVia: [`agf node update ${node.id} --description "..." (corrigir pointer morto: ${missing.join(', ')})`],
      },
    })
  }
  return gaps
}
