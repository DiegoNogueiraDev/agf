/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */

/**
 * OpenCode consumer profile — lean, no description fields.
 * Composing: imported by profiles.ts barrel.
 */

import type { CommandProfile } from './profiles-types.js'

export const PROFILE_OPENCODE: Record<string, CommandProfile> = {
  next: {
    select: ['data.node.id', 'data.node.title', 'data.node.status', 'data.reason'],
  },
  start: {
    select: ['data.taskId', 'data.title', 'data.context'],
    compressed: true,
  },
  context: {
    select: ['data.node', 'data.acceptanceCriteria', 'data.blockers'],
    compressed: true,
  },
  check: {
    select: ['data.dod.ready', 'data.dod.score', 'data.dod.grade'],
  },
  done: {
    // `surface_proof` rides along so a refusal is machine-readable, not just prose.
    select: ['data.taskId', 'data.surface_proof', 'data.dodScore', 'data.dodGrade', 'data.savings.totalSaved'],
  },
  submit: {
    select: ['data.taskId', 'data.dodScore', 'data.applied', 'data.next.id'],
  },
  brief: {
    select: ['data.intent', 'data.task', 'data.acceptanceCriteria', 'data.readyToDelegate'],
  },
  stats: {
    select: ['data.totalNodes', 'data.totalEdges', 'data.byStatus'],
  },
  query: {
    select: ['data.*.id', 'data.*.title', 'data.*.status', 'data.*.type'],
  },
  search: {
    select: ['data.*.id', 'data.*.title', 'data.*.score'],
  },
  gate: {
    select: [
      'data.phases.*.phase',
      'data.phases.*.report.ready',
      'data.phases.*.report.score',
      // Out-of-phase-advisory wrapper (design gate w/ --current-phase != DESIGN)
      'data.phases.*.report.advisory',
      'data.phases.*.report.phaseWarning',
      'data.phases.*.report.data.ready',
      'data.phases.*.report.data.score',
      'data.anyFail',
    ],
  },
  harness: {
    select: ['data.score', 'data.grade'],
  },
  gaps: {
    select: ['data.gaps.*.kind', 'data.gaps.*.severity', 'data.ready'],
  },
  'insights.summary': {
    select: ['data.completionRate', 'data.wip.alert', 'data.flowEfficiency'],
  },
  forecast: {
    select: ['data.etaDays', 'data.etaDate', 'data.trend'],
  },
  metrics: {
    // The KR for the surface gate reads this; projected away it is silently invisible.
    select: ['data.totals', 'data.surfaceGate', 'data.costPerSuccess'],
  },
  deliver: {
    select: ['data.steps', 'data.stopped'],
  },
  autopilot: {
    select: ['data.completed', 'data.stopped'],
  },
  status: {
    select: ['data.mode', 'data.provider', 'data.model'],
  },
  'memory.write': { select: ['data.name'] },
  'memory.read': { select: ['data.content'] },
  'memory.list': { select: ['data'] },
  'node.add': { select: ['data.id', 'data.title'] },
  'node.show': { select: ['data.node'] },
  'node.status': { select: ['data.id', 'data.from', 'data.to'] },
  'edge.add': { select: ['data.id', 'data.from', 'data.to'] },
  test: { select: ['data.passed'] },
  lint: { select: ['data.passed'] },
  run: { select: ['data.ok', 'data.output'] },
  export: { select: ['data.path'] },
  'import-prd': { select: ['data.nodeCount'] },
  savings: { select: ['data.totalSaved'] },
  decompose: { select: ['data.candidates.*.nodeId', 'data.candidates.*.title'] },
  phase: { select: ['data.current'] },
  build: { select: ['data.steps', 'data.stopped'] },
}
