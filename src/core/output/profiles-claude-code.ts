/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Claude Code consumer profile — full conductor/executor cycle coverage.
 * Composing: imported by profiles.ts barrel.
 */

import type { CommandProfile } from './profiles-types.js'

export const PROFILE_CLAUDE_CODE: Record<string, CommandProfile> = {
  // ── Core cycle (pull → start → implement → done) ──
  next: {
    select: [
      'data.node.id',
      'data.node.title',
      'data.node.status',
      'data.node.priority',
      'data.node.type',
      'data.node.xpSize',
      'data.node.acceptanceCriteria',
      'data.reason',
      'data.suggested_model',
    ],
  },
  start: {
    select: ['data.taskId', 'data.title', 'data.context', 'data.colony_signals.suggested_model'],
    compressed: true,
  },
  context: {
    select: [
      'data.task',
      'data.node',
      'data.acceptanceCriteria',
      'data.blockers',
      'data.dependsOn',
      'data.parent',
      'data.children',
      'data.metrics.estimatedTokens',
    ],
    compressed: true,
  },
  check: {
    select: ['data.dod.ready', 'data.dod.score', 'data.dod.grade', 'data.dod.checks', 'data.files_modified_warning'],
  },
  done: {
    select: [
      'data.taskId',
      // A surface leaf can be REFUSED for lack of scenario proof; without this the
      // agent sees the refusal code and no machine-readable state to act on.
      'data.surface_proof',
      'data.dodScore',
      'data.dodGrade',
      'data.savings.totalSaved',
      'data.savings.savingsRate',
      'data.next.id',
      'data.next.title',
      'data.next.reason',
    ],
  },
  submit: {
    select: [
      'data.taskId',
      'data.dodScore',
      'data.dodGrade',
      'data.applied',
      'data.deviations',
      'data.findingIds',
      'data.next.id',
      'data.next.title',
    ],
  },
  brief: {
    select: [
      'data.intent',
      'data.task',
      'data.acceptanceCriteria',
      'data.contract',
      'data.blastRadius',
      'data.notList',
      'data.dod',
      'data.selfReview',
      'data.returnSchema',
      'data.readyToDelegate',
      'data.blockers',
      'data.imitate',
      'data.readTouch',
      'data.testWith',
    ],
  },

  // ── Graph reading ──
  stats: {
    select: ['data.totalNodes', 'data.totalEdges', 'data.byType', 'data.byStatus'],
  },
  query: {
    select: ['data.*.id', 'data.*.title', 'data.*.status', 'data.*.type', 'data.*.priority'],
  },
  search: {
    select: ['data.*.id', 'data.*.title', 'data.*.score', 'data.*.status'],
  },
  kanban: {
    select: ['data.board.columns', 'data.board.metrics.wipViolations', 'data.board.metrics.blockedPercentage'],
  },

  // ── Node/Edge CRUD ──
  'node.add': {
    select: ['data.id', 'data.type', 'data.status', 'data.title'],
  },
  'node.show': {
    select: ['data.node', 'data.outEdges', 'data.incEdges'],
  },
  'node.ls': {
    select: ['data'],
  },
  'node.status': {
    select: ['data.id', 'data.from', 'data.to'],
  },
  'node.update': {
    select: ['data.id', 'data.updated'],
  },
  'node.rm': {
    select: ['data.id', 'data.archived'],
  },
  'node.clone': {
    select: ['data.source', 'data.clone'],
  },
  'node.move': {
    select: ['data.id', 'data.parent'],
  },
  'node.restore': {
    select: ['data.id', 'data.restored'],
  },
  'node.tags': {
    select: ['data.id', 'data.tags'],
  },
  'node.rationale.set': {
    select: ['data.id', 'data.date'],
  },
  'node.rationale.get': {
    select: ['data.id', 'data.rationale'],
  },
  'edge.add': {
    select: ['data.id', 'data.from', 'data.to', 'data.relationType'],
  },
  'edge.rm': {
    select: ['data.id', 'data.removed'],
  },
  'edge.ls': {
    select: ['data.*.id', 'data.*.from', 'data.*.to', 'data.*.relationType'],
  },

  // ── Gates & quality ──
  gate: {
    select: [
      'data.phases.*.phase',
      'data.phases.*.report.ready',
      'data.phases.*.report.score',
      'data.phases.*.report.grade',
      'data.phases.*.report.checks.*.name',
      'data.phases.*.report.checks.*.passed',
      'data.phases.*.report.checks.*.details',
      // Out-of-phase-advisory wrapper (design gate w/ --current-phase != DESIGN)
      'data.phases.*.report.advisory',
      'data.phases.*.report.phaseWarning',
      'data.phases.*.report.data.ready',
      'data.phases.*.report.data.score',
      'data.phases.*.report.data.grade',
      'data.phases.*.report.data.checks.*.name',
      'data.phases.*.report.data.checks.*.passed',
      'data.phases.*.report.data.checks.*.details',
      'data.anyFail',
    ],
  },
  harness: {
    select: ['data.score', 'data.grade', 'data.breakdown', 'data.regression', 'data.regressionDelta'],
  },
  quality: {
    select: ['data.score', 'data.grade', 'data.dimensions', 'data.darkModules'],
  },
  gaps: {
    select: [
      'data.gaps.*.kind',
      'data.gaps.*.severity',
      'data.gaps.*.nodeId',
      'data.gaps.*.evidence',
      'data.gaps.*.enrichment.applyVia',
      'data.gaps.*.enrichment.instruction',
      'data.ready',
      'data.score',
    ],
  },

  // ── Insights ──
  'insights.summary': {
    select: [
      'data.completionRate',
      'data.statusDistribution',
      'data.wip.current',
      'data.wip.alert',
      'data.bottlenecks.blockedTasks',
      'data.flowEfficiency',
    ],
  },
  'insights.dora': {
    select: ['data.deploymentFrequency', 'data.leadTime', 'data.changeFailureRate', 'data.mttr', 'data.trend'],
  },
  'insights.bottlenecks': {
    select: ['data.blockedTasks', 'data.criticalPath', 'data.missingAcceptanceCriteria', 'data.oversizedTasks'],
  },
  'insights.phases': {
    select: ['data.*.phase', 'data.*.taskCount', 'data.*.percentage'],
  },
  'insights.wip': {
    select: ['data.current', 'data.alert'],
  },
  'insights.flow': {
    select: ['data.verdict', 'data.flowOn.tokensSavedPct', 'data.flowOff.tokensSavedPct'],
  },
  'insights.behavioral': {
    select: ['data.autonomyRate', 'data.assertiveness.assertivenessRate', 'data.velocity'],
  },

  // ── Forecast & metrics ──
  forecast: {
    select: ['data.etaDays', 'data.etaDate', 'data.velocityPerDay', 'data.backlogCount', 'data.trend'],
  },
  metrics: {
    // The KR for the surface gate reads this; projected away it is silently invisible.
    select: ['data.totals', 'data.surfaceGate', 'data.avgTokensPerTask', 'data.costPerSuccess', 'data.succeeded'],
  },
  savings: {
    select: [
      'data.totals',
      'data.savingsRate',
      'data.totalSaved',
      'data.baselineMethods',
      'data.attribution',
      'data.bySession',
    ],
  },

  // ── Decompose & planning ──
  decompose: {
    select: [
      'data.candidates.*.nodeId',
      'data.candidates.*.title',
      'data.candidates.*.reasons',
      'data.candidates.*.suggestedSubtasks',
    ],
  },
  phase: {
    select: ['data.phases', 'data.current', 'data.hasProject'],
  },

  // ── Memory ──
  'memory.write': {
    select: ['data.name', 'data.bytes'],
  },
  'memory.read': {
    select: ['data.name', 'data.content'],
  },
  'memory.list': {
    select: ['data'],
  },
  'memory.rm': {
    select: ['data.name', 'data.removed'],
  },
  'memory.search': {
    select: ['data.*.name', 'data.*.content', 'data.*.score'],
  },

  // ── Deliver & autopilot ──
  deliver: {
    select: ['data.steps', 'data.stopped', 'data.tokensTotal', 'data.prompt'],
  },
  autopilot: {
    select: [
      'data.completed',
      'data.escalated',
      'data.stopped',
      'data.steps.*.nodeId',
      'data.steps.*.title',
      'data.steps.*.action',
    ],
  },
  run: {
    select: ['data.ok', 'data.output', 'data.exitCode', 'data.testPassed'],
  },

  // ── Status & config ──
  status: {
    select: ['data.mode', 'data.provider', 'data.model', 'data.tokens', 'data.costUsd'],
  },
  doctor: {
    select: ['data.checks', 'data.provider'],
  },

  // ── Export & import ──
  export: {
    select: ['data.path', 'data.nodeCount', 'data.edgeCount'],
  },
  'import-prd': {
    select: ['data.nodeCount', 'data.edgeCount', 'data.diff'],
  },
  'import-graph': {
    select: ['data.dryRun', 'data.merged', 'data.nodeCount', 'data.edgeCount'],
  },

  // ── Utility ──
  lint: {
    select: ['data.passed', 'data.code'],
  },
  test: {
    select: ['data.passed', 'data.code'],
  },
  heal: {
    select: ['data.applied', 'data.fixes', 'data.summary'],
  },
  gc: {
    select: ['data.pruned', 'data.branches'],
  },

  // ── Snapshot ──
  'snapshot.create': {
    select: ['data.id', 'data.nodeCount'],
  },
  'snapshot.list': {
    select: ['data'],
  },
  'snapshot.restore': {
    select: ['data.id', 'data.restored'],
  },

  // ── Colony & swarm ──
  'colony-health': {
    select: ['data.grade', 'data.scores', 'data.recommendations'],
  },
  'swarm.session': {
    select: ['data.sessionId', 'data.status', 'data.topology'],
  },
  'swarm.claim': {
    select: ['data.resource', 'data.agent', 'data.ttl'],
  },
  'swarm.send': {
    select: ['data messageId', 'data.ack'],
  },
  'swarm.consensus': {
    select: ['data.result', 'data.votes'],
  },

  // ── Economy & model ──
  economy: {
    select: ['data.levers.*.name', 'data.levers.*.enabled', 'data.levers.*.saved'],
  },
  'model.list': {
    select: ['data'],
  },
  'model.current': {
    select: ['data.model', 'data.tier'],
  },
  'model.set': {
    select: ['data.model', 'data.previous'],
  },
  'model.route': {
    select: ['data.model', 'data.tier', 'data.reason'],
  },
  'provider.list': {
    select: ['data'],
  },
  'provider.current': {
    select: ['data.active', 'data.failover'],
  },
  'provider.use': {
    select: ['data.provider', 'data.previous'],
  },

  // ── Adaptive ──
  calibrate: {
    select: ['data.lever', 'data.recommended_threshold', 'data.sample_count'],
  },
  immune: {
    select: ['data.summary', 'data.ledger.*.pattern', 'data.ledger.*.count'],
  },
  provenance: {
    select: ['data.tiers', 'data.distribution'],
  },
  'provenance.promote': {
    select: ['data.nodeId', 'data.from', 'data.to'],
  },
  'provenance.hash': {
    select: ['data.hash', 'data.algorithm'],
  },

  // ── Hooks ──
  'hooks.list': {
    select: ['data'],
  },
  'hooks.test': {
    select: ['data.channel', 'data.fired', 'data.result'],
  },
  'hooks.discover': {
    select: ['data'],
  },

  // ── Code intelligence ──
  'code.search': {
    select: ['data.*.symbol', 'data.*.file', 'data.*.line'],
  },
  'code.impact': {
    select: ['data.*.symbol', 'data.*.file', 'data.*.impact'],
  },
  'code.def': {
    select: ['data.symbol', 'data.file', 'data.line'],
  },

  // ── Spec & governance ──
  'spec.list-templates': {
    select: ['data'],
  },
  'spec.generate': {
    select: ['data.content', 'data.template'],
  },
  'spec.validate': {
    select: ['data.valid', 'data.errors'],
  },
  constitution: {
    select: ['data.principles', 'data.violations'],
  },
  principles: {
    select: ['data'],
  },
  'adr.list': {
    select: ['data'],
  },
  'adr.create': {
    select: ['data.id', 'data.title', 'data.path'],
  },

  // ── Plugin ──
  'plugin.list': {
    select: ['data'],
  },
  'plugin.info': {
    select: ['data'],
  },

  // ── Preset ──
  'preset.list': {
    select: ['data'],
  },
  'preset.show': {
    select: ['data'],
  },

  // ── Skill ──
  'skill.list': {
    select: ['data'],
  },
  'skill.show': {
    select: ['data.name', 'data.content'],
  },

  // ── Usage ──
  usage: {
    select: ['data.frequencies', 'data.total', 'data.top'],
  },

  // ── Loop ──
  'loop.interval': {
    select: ['data.runs', 'data.duration', 'data.results.*.nodeId', 'data.results.*.action'],
  },
  'loop.goal': {
    select: ['data.attempts', 'data.stopReason', 'data.gradeReport'],
  },

  // ── Dream ──
  dream: {
    select: ['data.status', 'data.cycles', 'data.consolidated'],
  },

  // ── Learning ──
  'learning.stats': {
    select: ['data'],
  },
  'learning.route': {
    select: ['data.model', 'data.tier', 'data.reason'],
  },
  'learning.export': {
    select: ['data'],
  },

  // ── Daemon ──
  'daemon.status': {
    select: ['data.running', 'data.pid', 'data.uptime'],
  },
  'daemon.stop': {
    select: ['data.stopped', 'data.pid'],
  },

  // ── Login ──
  login: {
    select: ['data.method', 'data.authPath'],
  },
  logout: {
    select: ['data.removed'],
  },

  // ── Compress / tool-compress ──
  'compress.filters': {
    select: ['data'],
  },
  'compress.discover': {
    select: ['data'],
  },
  'compress.test': {
    select: ['data.filter', 'data.matched'],
  },

  // ── Retrieve ──
  retrieve: {
    select: ['data.original', 'data.matches', 'data.compressed'],
  },
  'retrieve-command': {
    // `decision` and `fallback` are not optional context: below the gate `command` is null and
    // the fallback is the whole answer. Without them the agent reads a refusal as a result.
    select: ['data.query', 'data.command', 'data.decision', 'data.confidence', 'data.fallback', 'data.economy'],
  },
  'montar-output': {
    // `slots` are the holes the model fills. Without them a recovered scaffold is a name, and
    // the model writes the file from scratch — paying full price for a lever that was pulled.
    select: [
      'data.decision',
      'data.reason',
      'data.structure',
      'data.scaffold',
      'data.slots',
      'data.language',
      'data.confidence',
      'data.economy',
    ],
  },

  // ── Scan repos ──
  'scan-repos': {
    select: ['data.insights', 'data.reportPath'],
  },

  // ── Scaffold ──
  scaffold: {
    select: ['data.nodeId', 'data.files', 'data.creative'],
  },

  // ── Eval ──
  'eval.run': {
    select: ['data.score', 'data.passed', 'data.scenarios'],
  },
  'eval.compare': {
    select: ['data'],
  },
  'eval.ci-gate': {
    select: ['data.passed', 'data.score'],
  },

  // ── Harness extras ──
  'harness.violations': {
    select: ['data.score', 'data.grade', 'data.violations'],
  },
  'harness.saturation': {
    select: ['data.score', 'data.grade', 'data.saturation'],
  },

  // ── Colony extras ──
  'colony-health.list': {
    select: ['data'],
  },
  'colony-health.snapshot': {
    select: ['data'],
  },

  // ── Caste ──
  'caste.list': {
    select: ['data'],
  },
  'caste.show': {
    select: ['data'],
  },

  // ── Build ──
  build: {
    select: ['data.steps', 'data.stopped', 'data.completed'],
  },

  // ── Exec ──
  'exec.pipe': {
    select: ['data'],
  },
  'exec.chain': {
    select: ['data'],
  },

  // ── Generate PRD ──
  'generate-prd': {
    select: ['data.prdFile', 'data.nodeCount', 'data.edgeCount'],
  },

  // ── Template ──
  'template.list': {
    select: ['data'],
  },
  'template.apply': {
    select: ['data.created', 'data.nodeIds'],
  },

  // ── Provenance extras ──
  'provenance.downgrade': {
    select: ['data.nodeId', 'data.from', 'data.to', 'data.cause'],
  },
  'provenance.list': {
    select: ['data'],
  },

  // ── Spec-sync ──
  'spec-sync.register': {
    select: ['data.specId', 'data.version'],
  },
  'spec-sync.list': {
    select: ['data'],
  },
  'spec-sync.status': {
    select: ['data'],
  },
  'spec-sync.link': {
    select: ['data.specId', 'data.nodeId', 'data.linked'],
  },

  // ── UI ──
  ui: {
    select: ['data.url', 'data.hint'],
  },

  // ── Profile ──
  'profile.list': {
    select: ['data'],
  },
  'profile.apply': {
    select: ['data.profile', 'data.applied'],
  },

  // ── Init ──
  init: {
    select: ['data.storeDir', 'data.dbPath', 'data.nodeCount', 'data.version'],
  },

  // ── Help ──
  help: {
    select: ['data.groups'],
  },

  // ── Calibrate extras ──
  'calibrate.ab': {
    select: ['data.config_a', 'data.config_b', 'data.t_statistic', 'data.p_value'],
  },

  // ── Heal extras ──
  'heal.log': {
    select: ['data'],
  },
  'heal.dashboard': {
    select: ['data'],
  },

  // ── Immune extras ──
  'immune.dashboard': {
    select: ['data'],
  },
  'immune.global': {
    select: ['data'],
  },

  // ── Flow ──
  'flow.next-context': {
    select: ['data.node', 'data.reason', 'data.context'],
    compressed: true,
  },
  'flow.next-start': {
    select: ['data.taskId', 'data.title', 'data.context'],
    compressed: true,
  },
}
