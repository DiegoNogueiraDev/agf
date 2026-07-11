/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { PresetDefinition } from '../../schemas/preset.schema.js'

const ALL_PHASES = [
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
] as const

const defaultPreset: PresetDefinition = {
  name: 'default',
  description: 'Default preset — current mcp-graph behavior with advisory enforcement',
  lifecycle: {
    phases: [...ALL_PHASES],
    strictness: 'advisory',
    codeIntelligence: 'advisory',
    prerequisites: 'advisory',
  },
  dod: {
    checks: {
      has_acceptance_criteria: true,
      ac_quality_pass: true,
      no_unresolved_blockers: true,
      status_flow_valid: true,
      has_description: false,
      not_oversized: false,
      has_testable_ac: false,
      has_estimate: false,
      has_test_files: false,
    },
  },
}

const strictTddPreset: PresetDefinition = {
  name: 'strict-tdd',
  description: 'Strict TDD preset — all enforcement layers strict, AC and tests required',
  extends: 'default',
  lifecycle: {
    phases: [...ALL_PHASES],
    strictness: 'strict',
    codeIntelligence: 'strict',
    prerequisites: 'strict',
  },
  dod: {
    checks: {
      has_acceptance_criteria: true,
      ac_quality_pass: true,
      no_unresolved_blockers: true,
      status_flow_valid: true,
      has_description: true,
      not_oversized: true,
      has_testable_ac: true,
      has_estimate: true,
      has_test_files: true,
      complexity_budget_pass: true,
      surgical_scope_pass: true,
    },
  },
}

const agileLightPreset: PresetDefinition = {
  name: 'agile-light',
  description: 'Agile light preset — advisory mode, skip DESIGN phase for rapid iteration',
  extends: 'default',
  lifecycle: {
    phases: ['ANALYZE', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'],
    strictness: 'advisory',
    codeIntelligence: 'advisory',
    prerequisites: 'advisory',
  },
  dod: {
    checks: {
      has_acceptance_criteria: true,
      ac_quality_pass: false,
      no_unresolved_blockers: true,
      status_flow_valid: true,
      has_test_files: false,
    },
  },
}

const enterprisePreset: PresetDefinition = {
  name: 'enterprise',
  description: 'Enterprise preset — all phases, strict enforcement, constitution required',
  extends: 'default',
  lifecycle: {
    phases: [...ALL_PHASES],
    strictness: 'strict',
    codeIntelligence: 'strict',
    prerequisites: 'strict',
  },
  dod: {
    checks: {
      has_acceptance_criteria: true,
      ac_quality_pass: true,
      no_unresolved_blockers: true,
      status_flow_valid: true,
      has_description: true,
      not_oversized: true,
      has_testable_ac: true,
      has_estimate: true,
      has_test_files: true,
      constitution_check: true,
      complexity_budget_pass: true,
      surgical_scope_pass: true,
    },
  },
}

export const BUILT_IN_PRESETS: PresetDefinition[] = [defaultPreset, strictTddPreset, agileLightPreset, enterprisePreset]

/** Look up a built-in preset by name. */
export function getPreset(name: string): PresetDefinition | undefined {
  return BUILT_IN_PRESETS.find((p) => p.name === name)
}

/** Recursively resolve preset inheritance by merging parent fields into child overrides. */
export function resolvePresetInheritance(
  preset: PresetDefinition,
  availablePresets: PresetDefinition[],
): PresetDefinition {
  if (!preset.extends) {
    return preset
  }

  const parent = availablePresets.find((p) => p.name === preset.extends)
  if (!parent) {
    return preset
  }

  // Resolve parent first (recursive)
  const resolvedParent = resolvePresetInheritance(parent, availablePresets)

  // Merge: child overrides parent at field level
  return {
    ...resolvedParent,
    ...preset,
    name: preset.name,
    description: preset.description,
    lifecycle: {
      ...resolvedParent.lifecycle,
      ...preset.lifecycle,
    },
    dod: {
      checks: {
        ...resolvedParent.dod?.checks,
        ...preset.dod?.checks,
      },
      customChecks: [...(resolvedParent.dod?.customChecks ?? []), ...(preset.dod?.customChecks ?? [])],
    },
    classifierPatterns: {
      ...resolvedParent.classifierPatterns,
      ...preset.classifierPatterns,
    },
    templates: preset.templates ?? resolvedParent.templates,
    tags: preset.tags ?? resolvedParent.tags,
  }
}
