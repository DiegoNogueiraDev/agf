/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Minimal consumer profile — absolute essential fields only (for --ai flag).
 * Composing: imported by profiles.ts barrel.
 */

import type { CommandProfile } from './profiles-types.js'

export const PROFILE_MINIMAL: Record<string, CommandProfile> = {
  next: {
    select: ['data.node.id', 'data.node.title'],
  },
  start: {
    select: ['data.taskId', 'data.title'],
    compressed: true,
  },
  context: {
    select: ['data.node', 'data.acceptanceCriteria'],
    compressed: true,
  },
  check: {
    select: ['data.dod.ready', 'data.dod.score'],
  },
  done: {
    select: ['data.taskId', 'data.dodScore'],
  },
  submit: {
    select: ['data.taskId', 'data.dodScore'],
  },
  brief: {
    select: ['data.intent', 'data.task', 'data.acceptanceCriteria'],
  },
  stats: {
    select: ['data.totalNodes', 'data.byStatus'],
  },
  query: {
    select: ['data.*.id', 'data.*.title'],
  },
  search: {
    select: ['data.*.id', 'data.*.title'],
  },
  gate: {
    select: [
      'data.phases.*.phase',
      'data.phases.*.report.ready',
      'data.phases.*.report.score',
      // Out-of-phase-advisory wrapper (design gate w/ --current-phase != DESIGN)
      'data.phases.*.report.advisory',
      'data.phases.*.report.data.ready',
      'data.phases.*.report.data.score',
    ],
  },
  harness: {
    select: ['data.score', 'data.grade'],
  },
  quality: {
    select: ['data.score', 'data.grade'],
  },
  gaps: {
    select: ['data.gaps.*.kind', 'data.gaps.*.severity', 'data.gaps.*.nodeId', 'data.gaps.*.evidence', 'data.ready'],
  },
  'insights.summary': {
    select: ['data.completionRate', 'data.wip.alert'],
  },
  'insights.dora': {
    select: ['data.deploymentFrequency', 'data.mttr', 'data.trend'],
  },
  forecast: {
    select: ['data.etaDays', 'data.trend'],
  },
  metrics: {
    select: ['data.totals'],
  },
  savings: {
    select: ['data.totalSaved'],
  },
  decompose: {
    select: ['data.candidates.*.nodeId', 'data.candidates.*.title'],
  },
  deliver: {
    select: ['data.steps', 'data.stopped'],
  },
  autopilot: {
    select: ['data.completed', 'data.stopped'],
  },
  status: {
    select: ['data.mode', 'data.model'],
  },
  'memory.write': { select: ['data.name'] },
  'memory.read': { select: ['data.content'] },
  'memory.list': { select: ['data'] },
  'memory.search': { select: ['data.*.name'] },
  'node.add': { select: ['data.id', 'data.title'] },
  'node.show': { select: ['data.node'] },
  'node.status': { select: ['data.id', 'data.to'] },
  'node.ls': { select: ['data'] },
  'node.update': { select: ['data.id', 'data.updated'] },
  'node.rm': { select: ['data.id'] },
  'node.clone': { select: ['data.clone'] },
  'node.move': { select: ['data.id', 'data.parent'] },
  'edge.add': { select: ['data.id', 'data.from', 'data.to'] },
  'edge.rm': { select: ['data.id'] },
  'edge.ls': { select: ['data'] },
  test: { select: ['data.passed'] },
  lint: { select: ['data.passed'] },
  run: { select: ['data.ok'] },
  export: { select: ['data.path'] },
  'import-prd': { select: ['data.nodeCount'] },
  'import-graph': { select: ['data.merged'] },
  doctor: { select: ['data.provider'] },
  'model.current': { select: ['data.model'] },
  'provider.current': { select: ['data.active'] },
  heal: { select: ['data.applied'] },
  gc: { select: ['data.pruned'] },
  'snapshot.create': { select: ['data.id'] },
  'snapshot.list': { select: ['data'] },
  'snapshot.restore': { select: ['data.id'] },
  phase: { select: ['data.current'] },
  build: { select: ['data.steps'] },
  init: { select: ['data.nodeCount'] },
  'colony-health': { select: ['data.grade'] },
  immune: { select: ['data.summary'] },
  provenance: { select: ['data.tiers'] },
  calibrate: { select: ['data.lever', 'data.recommended_threshold'] },
  economy: { select: ['data'] },
  'learning.stats': { select: ['data'] },
  'daemon.status': { select: ['data.running'] },
  login: { select: ['data.method'] },
  logout: { select: ['data.removed'] },
  'hooks.list': { select: ['data'] },
  'hooks.test': { select: ['data.fired'] },
  'code.search': { select: ['data'] },
  'code.def': { select: ['data.file', 'data.line'] },
  'spec.list-templates': { select: ['data'] },
  'spec.validate': { select: ['data.valid'] },
  constitution: { select: ['data.violations'] },
  principles: { select: ['data'] },
  'adr.list': { select: ['data'] },
  'adr.create': { select: ['data.id'] },
  'plugin.list': { select: ['data'] },
  'preset.list': { select: ['data'] },
  'skill.list': { select: ['data'] },
  'skill.show': { select: ['data.name'] },
  usage: { select: ['data.total'] },
  'loop.interval': { select: ['data.runs', 'data.duration'] },
  'loop.goal': { select: ['data.attempts', 'data.stopReason'] },
  dream: { select: ['data.status'] },
  'compress.filters': { select: ['data'] },
  retrieve: { select: ['data.original'] },
  'retrieve-command': { select: ['data.command'] },
  'montar-output': { select: ['data.decision'] },
  'scan-repos': { select: ['data.insights'] },
  scaffold: { select: ['data.files'] },
  'eval.run': { select: ['data.score', 'data.passed'] },
  'eval.ci-gate': { select: ['data.passed'] },
  'caste.list': { select: ['data'] },
  'profile.list': { select: ['data'] },
  'profile.apply': { select: ['data.applied'] },
  help: { select: ['data.groups'] },
  ui: { select: ['data.url'] },
  'generate-prd': { select: ['data.prdFile'] },
  'template.list': { select: ['data'] },
  'template.apply': { select: ['data.created'] },
  'flow.next-context': {
    select: ['data.node', 'data.acceptanceCriteria'],
    compressed: true,
  },
  'flow.next-start': {
    select: ['data.taskId', 'data.title'],
    compressed: true,
  },
}
