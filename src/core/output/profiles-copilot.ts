/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Copilot consumer profile — similar to claude-code with extra description fields.
 * Composing: imported by profiles.ts barrel.
 */

import type { CommandProfile } from './profiles-types.js'

export const PROFILE_COPILOT: Record<string, CommandProfile> = {
  next: {
    select: [
      'data.node.id',
      'data.node.title',
      'data.node.status',
      'data.node.ac',
      'data.node.description',
      'data.reason',
    ],
  },
  start: {
    select: ['data.taskId', 'data.title', 'data.context'],
    compressed: true,
  },
  context: {
    select: ['data.task', 'data.acceptanceCriteria', 'data.sourceRef', 'data.metrics'],
    compressed: true,
  },
  check: {
    select: ['data.dod.ready', 'data.dod.score', 'data.dod.checks'],
  },
  done: {
    select: ['data.taskId', 'data.dodScore', 'data.dodGrade', 'data.next.id', 'data.next.title'],
  },
  submit: {
    select: ['data.taskId', 'data.dodScore', 'data.applied', 'data.deviations', 'data.next.id'],
  },
  brief: {
    select: [
      'data.intent',
      'data.task',
      'data.acceptanceCriteria',
      'data.contract',
      'data.blastRadius',
      'data.readyToDelegate',
    ],
  },
  stats: {
    select: ['data.totalNodes', 'data.byStatus'],
  },
  query: {
    select: ['data.*.id', 'data.*.title', 'data.*.status'],
  },
  search: {
    select: ['data.*.id', 'data.*.title', 'data.*.score'],
  },
  kanban: {
    select: ['data.board.columns', 'data.board.metrics'],
  },
  gate: {
    select: [
      'data.phases.*.phase',
      'data.phases.*.report.ready',
      'data.phases.*.report.score',
      'data.phases.*.report.grade',
      // Out-of-phase-advisory wrapper (design gate w/ --current-phase != DESIGN)
      'data.phases.*.report.advisory',
      'data.phases.*.report.phaseWarning',
      'data.phases.*.report.data.ready',
      'data.phases.*.report.data.score',
      'data.phases.*.report.data.grade',
      'data.anyFail',
    ],
  },
  harness: {
    select: ['data.score', 'data.grade', 'data.breakdown'],
  },
  quality: {
    select: ['data.score', 'data.grade'],
  },
  gaps: {
    select: ['data.gaps.*.kind', 'data.gaps.*.severity', 'data.gaps.*.enrichment.applyVia', 'data.ready'],
  },
  'insights.summary': {
    select: ['data.completionRate', 'data.wip.current', 'data.wip.alert', 'data.flowEfficiency'],
  },
  'insights.dora': {
    select: ['data.deploymentFrequency', 'data.leadTime', 'data.changeFailureRate', 'data.mttr', 'data.trend'],
  },
  forecast: {
    select: ['data.etaDays', 'data.etaDate', 'data.velocityPerDay', 'data.trend'],
  },
  metrics: {
    select: ['data.totals', 'data.avgTokensPerTask', 'data.costPerSuccess'],
  },
  decompose: {
    select: ['data.candidates.*.nodeId', 'data.candidates.*.title', 'data.candidates.*.suggestedSubtasks'],
  },
  deliver: {
    select: ['data.steps', 'data.stopped', 'data.tokensTotal'],
  },
  autopilot: {
    select: ['data.completed', 'data.escalated', 'data.stopped', 'data.steps.*.nodeId', 'data.steps.*.action'],
  },
  status: {
    select: ['data.mode', 'data.provider', 'data.model', 'data.tokens', 'data.costUsd'],
  },
  'memory.write': { select: ['data.name', 'data.bytes'] },
  'memory.read': { select: ['data.name', 'data.content'] },
  'memory.list': { select: ['data'] },
  'memory.search': { select: ['data.*.name', 'data.*.content'] },
  'node.add': { select: ['data.id', 'data.type', 'data.title'] },
  'node.show': { select: ['data.node', 'data.outEdges', 'data.incEdges'] },
  'node.status': { select: ['data.id', 'data.from', 'data.to'] },
  'edge.add': { select: ['data.id', 'data.from', 'data.to', 'data.relationType'] },
  'edge.ls': { select: ['data.*.from', 'data.*.to', 'data.*.relationType'] },
  test: { select: ['data.passed', 'data.code'] },
  lint: { select: ['data.passed'] },
  run: { select: ['data.ok', 'data.output', 'data.testPassed'] },
  export: { select: ['data.path', 'data.nodeCount'] },
  'import-prd': { select: ['data.nodeCount', 'data.edgeCount'] },
  doctor: { select: ['data.checks', 'data.provider'] },
  'model.current': { select: ['data.model', 'data.tier'] },
  'provider.current': { select: ['data.active'] },
  heal: { select: ['data.applied', 'data.fixes'] },
  savings: { select: ['data.totals', 'data.totalSaved'] },
  'snapshot.create': { select: ['data.id'] },
  'snapshot.list': { select: ['data'] },
  phase: { select: ['data.phases', 'data.current'] },
  build: { select: ['data.steps', 'data.stopped'] },
  init: { select: ['data.storeDir', 'data.nodeCount'] },
}
