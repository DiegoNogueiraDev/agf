/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Built-in spec templates — one per lifecycle phase.
 * Enriched from spec-kit patterns: constitution, specify, plan, tasks, implement.
 */

import type { SpecTemplate } from '../../schemas/spec-template.schema.js'

const prdTemplate: SpecTemplate = {
  name: 'prd-template',
  phase: 'ANALYZE',
  description: "Product Requirements Document template. Maps spec-kit 'specify' phase — defines what to build and why.",
  sections: [
    {
      title: 'Vision',
      description: 'Project vision statement and JTBD (Jobs to be Done)',
      required: true,
      placeholder: 'Describe what this project does and why it matters...',
      outputNodeType: 'epic',
    },
    {
      title: 'User Stories',
      description: 'User stories describing who benefits and how',
      required: true,
      placeholder: 'As a [user], I want to [action], so I can [benefit]',
      outputNodeType: 'task',
    },
    {
      title: 'Constraints',
      description: 'Technical, business, and regulatory constraints',
      required: true,
      placeholder: 'List constraints: stack, performance, compatibility...',
      outputNodeType: 'constraint',
      validationRules: ['minLength:50'],
    },
    {
      title: 'Acceptance Criteria',
      description: 'Testable criteria in Given-When-Then format',
      required: true,
      placeholder: 'GIVEN x WHEN y THEN z',
      outputNodeType: 'acceptance_criteria',
    },
    {
      title: 'Risks',
      description: 'Risk analysis with probability, impact, and mitigation',
      required: true,
      placeholder: 'Risk: [description]. Probability: [H/M/L]. Impact: [H/M/L]. Mitigation: [strategy]',
      outputNodeType: 'risk',
    },
    {
      title: 'Non-Functional Requirements',
      description: 'Performance, security, scalability requirements',
      required: false,
      outputNodeType: 'requirement',
    },
  ],
  variables: {
    projectName: { description: 'Project name', type: 'string', required: true },
    targetUsers: { description: 'Primary target users', type: 'string', required: false },
    timeline: { description: 'Target timeline', type: 'string', required: false },
  },
  constitution: true,
}

const architectureTemplate: SpecTemplate = {
  name: 'architecture-template',
  phase: 'DESIGN',
  description: "Architecture specification template. Maps spec-kit 'plan' phase — defines how to build it.",
  sections: [
    {
      title: 'System Context',
      description: 'High-level system context diagram and boundary definition',
      required: true,
      placeholder: 'Describe the system boundaries and external dependencies...',
      outputNodeType: 'epic',
    },
    {
      title: 'Components',
      description: 'Key architectural components and their responsibilities',
      required: true,
      placeholder: 'Component: [name] — Responsibility: [what it does]',
      outputNodeType: 'interface',
    },
    {
      title: 'Decisions (ADRs)',
      description: 'Architecture Decision Records with status, context, decision, consequences',
      required: true,
      placeholder: '## Status: Accepted\n## Context: ...\n## Decision: ...\n## Consequences: ...',
      outputNodeType: 'decision',
    },
    {
      title: 'Interfaces',
      description: 'API contracts, data models, and communication patterns',
      required: true,
      placeholder: 'Interface: [name] — Contract: [input] → [output]',
      outputNodeType: 'contract',
    },
    {
      title: 'Data Model',
      description: 'Database schema, storage strategy, migration plan',
      required: false,
      outputNodeType: 'data_table',
    },
  ],
  variables: {
    projectName: { description: 'Project name', type: 'string', required: true },
    stack: { description: 'Technology stack', type: 'string', required: false },
  },
  constitution: true,
}

const taskBreakdownTemplate: SpecTemplate = {
  name: 'task-breakdown-template',
  phase: 'PLAN',
  description: "Task decomposition template. Maps spec-kit 'tasks' phase — breaks work into atomic items.",
  sections: [
    {
      title: 'Epics',
      description: 'High-level feature groups with scope and priority',
      required: true,
      placeholder: '## Epic: [Name]\n[Description]\n**Prioridade:** 1',
      outputNodeType: 'epic',
    },
    {
      title: 'Task Decomposition',
      description: 'Atomic tasks per epic with size, priority, and AC',
      required: true,
      placeholder:
        '### Task N.M: [Title]\n**Tamanho:** S\n**Prioridade:** 2\n**Criterios de aceite:**\n- GIVEN x WHEN y THEN z',
      outputNodeType: 'task',
      validationRules: ['minLength:200'],
    },
    {
      title: 'Dependencies',
      description: 'Task dependency map and critical path',
      required: true,
      placeholder: 'Task 1.2 depends on Task 1.1\nTask 2.1 blocks Task 2.2',
    },
    {
      title: 'Sprint Allocation',
      description: 'Sprint assignments based on velocity and priority',
      required: false,
      outputNodeType: 'milestone',
    },
    {
      title: 'Estimates',
      description: 'Time and effort estimates per task (XP sizes)',
      required: false,
    },
  ],
  variables: {
    projectName: { description: 'Project name', type: 'string', required: true },
    sprintDuration: { description: 'Sprint duration in days', type: 'number', required: false, default: 14 },
    teamSize: { description: 'Team size', type: 'number', required: false, default: 1 },
  },
  constitution: false,
}

const implementationSpecTemplate: SpecTemplate = {
  name: 'implementation-spec-template',
  phase: 'IMPLEMENT',
  description: "Implementation specification template. Maps spec-kit 'implement' phase — guides TDD coding.",
  sections: [
    {
      title: 'Approach',
      description: 'Implementation strategy and key design decisions',
      required: true,
      placeholder: 'Describe the implementation approach, patterns used...',
    },
    {
      title: 'File Changes',
      description: 'Files to create or modify with description of changes',
      required: true,
      placeholder: '- CREATE src/core/feature.ts — [description]\n- MODIFY src/mcp/tools/index.ts — add registration',
    },
    {
      title: 'Test Plan',
      description: 'Test cases to write (TDD Red phase)',
      required: true,
      placeholder: '- Unit: [function] should [behavior]\n- Integration: [flow] should [outcome]',
      validationRules: ['minLength:100'],
    },
    {
      title: 'Edge Cases',
      description: 'Edge cases, error scenarios, and boundary conditions',
      required: true,
      placeholder: '- Empty input: should return [x]\n- Invalid format: should throw [error]',
    },
    {
      title: 'Acceptance Criteria',
      description: 'Verifiable acceptance criteria for this implementation',
      required: false,
      outputNodeType: 'acceptance_criteria',
    },
  ],
  variables: {
    taskId: { description: 'Graph task node ID', type: 'string', required: false },
    taskTitle: { description: 'Task title from graph', type: 'string', required: false },
  },
  constitution: false,
}

export const BUILT_IN_SPEC_TEMPLATES: SpecTemplate[] = [
  prdTemplate,
  architectureTemplate,
  taskBreakdownTemplate,
  implementationSpecTemplate,
]

/** Look up a built-in spec template by name. */
export function getSpecTemplate(name: string): SpecTemplate | undefined {
  return BUILT_IN_SPEC_TEMPLATES.find((t) => t.name === name)
}

/** List all built-in spec templates with summary metadata. */
export function listSpecTemplates(): Array<{ name: string; phase: string; description: string; sectionCount: number }> {
  return BUILT_IN_SPEC_TEMPLATES.map((t) => ({
    name: t.name,
    phase: t.phase,
    description: t.description,
    sectionCount: t.sections.length,
  }))
}
