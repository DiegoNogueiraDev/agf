/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-OUT recurring artifact descriptors — "seus próprios artefatos recorrentes"
 * (PRD 2.2 source 1). These are document-level scaffolds that the agent generates
 * repeatedly with small variations: PRDs, lifecycle skills, and repo/project
 * structures. Unlike the code scaffolders (contract/interface/state-machine),
 * these are language-agnostic and represent structural patterns in text artifacts.
 *
 * Each descriptor follows the ScaffoldDescriptor interface; `language` is
 * deliberately omitted so the gate never rejects them on language mismatch.
 */

import type { ScaffoldDescriptor } from './gate.js'

export const RECURRING_ARTIFACT_DESCRIPTORS: readonly ScaffoldDescriptor[] = [
  {
    id: 'prd-software',
    goal: 'PRD de produto de software com fases e métricas',
    fitTags: [
      'prd',
      'product',
      'software',
      'requirements',
      'phases',
      'metrics',
      'risks',
      'fases',
      'metricas',
      'produto',
    ],
    slots: ['nome', 'problema', 'fases[]', 'metricas[]', 'riscos[]'],
    noveltyFloor: 0.62,
    structureRef: 'templates/prd_v2.md',
  },
  {
    id: 'skill-lifecycle',
    goal: 'arquivo de skill para uma fase do lifecycle do agente (SKILL.md)',
    fitTags: ['skill', 'agent', 'lifecycle', 'phase', 'implement', 'validate', 'agente', 'fase', 'flow'],
    slots: ['skillName', 'phase', 'whenToUse', 'steps[]', 'entryCommand', 'relatedSkills[]'],
    noveltyFloor: 0.6,
    structureRef: 'templates/skill.md',
  },
  {
    id: 'repo-structure',
    goal: 'estrutura de repositório de projeto com README, CLAUDE.md e layout de src',
    fitTags: [
      'repo',
      'project',
      'structure',
      'layout',
      'readme',
      'setup',
      'scaffold',
      'init',
      'repositorio',
      'projeto',
    ],
    slots: ['projectName', 'stack', 'commands[]', 'conventions[]'],
    noveltyFloor: 0.55,
    structureRef: 'templates/repo-structure.md',
  },
]

export function loadRecurringArtifactCorpus(): readonly ScaffoldDescriptor[] {
  return RECURRING_ARTIFACT_DESCRIPTORS
}
