/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-OUT scaffold corpus — derived from the existing deterministic scaffolder
 * registry (reuse, do not duplicate). Each registry entry becomes a
 * {@link ScaffoldDescriptor} with fit tags (keywords + split capabilities),
 * declared slots (the holes the LLM fills), and a conservative `noveltyFloor`.
 *
 * Conservative floors at the start (PRD decision): recover only with high
 * confidence; loosen later with telemetry (`rag_out_recovery` × saved).
 */

import { SCAFFOLD_REGISTRY } from '../scaffolder/registry.js'
import type { ScaffoldDescriptor } from './gate.js'
import { RECURRING_ARTIFACT_DESCRIPTORS } from './recurring-artifacts.js'
import { CODE_BOILERPLATE_DESCRIPTORS } from './code-boilerplates.js'

/** Slots per scaffold kind — the variable points filled after recovery. */
const SLOTS: Record<string, string[]> = {
  contract: ['route', 'method', 'requestSchema', 'responseSchema', 'handlerBody'],
  interface: ['name', 'methods', 'types'],
  'state-machine': ['states', 'events', 'transitions'],
  formula: ['inputs', 'output', 'expression', 'invariants'],
}

/** Per-kind recovery floor (conservative start). */
const NOVELTY_FLOOR: Record<string, number> = {
  contract: 0.5,
  interface: 0.5,
  'state-machine': 0.6,
  formula: 0.6,
}

export function buildScaffoldCorpus(): ScaffoldDescriptor[] {
  return SCAFFOLD_REGISTRY.map((e) => ({
    id: e.kind,
    goal: e.description,
    fitTags: [...e.keywords, ...e.capabilities.flatMap((c) => c.split('-'))],
    slots: SLOTS[e.kind] ?? [],
    noveltyFloor: NOVELTY_FLOOR[e.kind] ?? 0.5,
    structureRef: `scaffolder:${e.kind}`,
    // The built-in deterministic scaffolders emit TypeScript; the language
    // guard prevents them being recovered into a non-TS project.
    language: 'typescript' as const,
  }))
}

/** Default scaffold corpus available without any download (registry-derived + recurring artifacts). */
export function loadDefaultScaffoldCorpus(): ScaffoldDescriptor[] {
  return [...buildScaffoldCorpus(), ...RECURRING_ARTIFACT_DESCRIPTORS, ...CODE_BOILERPLATE_DESCRIPTORS]
}
