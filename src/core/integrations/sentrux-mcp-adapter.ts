/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-sentrux-adoption — Task 1.3: Wire 4 Sentrux MCP tools via adapter.
 *
 * Wraps scan, session_start, session_end, check_rules with Zod v4 parsing.
 * The McpCallFn is injectable for testing without a live Sentrux MCP server.
 */

import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'
import { z } from 'zod/v4'
import {
  SentruxScanResultSchema,
  SentruxSessionStartResultSchema,
  SentruxSessionEndResultSchema,
  SentruxCheckRulesResultSchema,
  SentruxHealthResultSchema,
  SentruxRescanResultSchema,
  SentruxEvolutionResultSchema,
  SentruxDsmResultSchema,
  SentruxTestGapsResultSchema,
  type SentruxScanResult,
  type SentruxSessionStartResult,
  type SentruxSessionEndResult,
  type SentruxCheckRulesResult,
  type SentruxHealthResult,
  type SentruxRescanResult,
  type SentruxEvolutionResult,
  type SentruxDsmResult,
  type SentruxTestGapsResult,
} from '../../schemas/sentrux.schema.js'

const log = createLogger({ layer: 'core', source: 'sentrux-mcp-adapter.ts' })

export type McpCallFn = (tool: string, args: Record<string, unknown>) => Promise<unknown>

async function defaultMcpCall(_tool: string, _args: Record<string, unknown>): Promise<unknown> {
  throw new McpGraphError('SentruxMcpAdapter: no MCP client configured — inject a McpCallFn for real calls')
}

function parseOrThrow<T>(tool: string, schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw)
  if (result.success) return result.data
  const issues = result.error.issues.map((i) => `${String(i.path.join('.'))}: ${i.message}`).join('; ')
  throw new McpGraphError(`sentrux:${tool} parse error — ${issues}`)
}

export class SentruxMcpAdapter {
  constructor(private readonly call: McpCallFn = defaultMcpCall) {}

  async scan(args: Record<string, unknown> = {}): Promise<SentruxScanResult> {
    const raw = await this.call('scan', args)
    const result = parseOrThrow('scan', SentruxScanResultSchema, raw)
    log.info('sentrux:scan', { runId: result.runId, severity: result.severity })
    return result
  }

  async sessionStart(args: { label?: string } = {}): Promise<SentruxSessionStartResult> {
    const raw = await this.call('session_start', args as Record<string, unknown>)
    const result = parseOrThrow('session_start', SentruxSessionStartResultSchema, raw)
    log.info('sentrux:session_start', { sessionId: result.sessionId })
    return result
  }

  async sessionEnd(args: { sessionId: string }): Promise<SentruxSessionEndResult> {
    const raw = await this.call('session_end', args as Record<string, unknown>)
    const result = parseOrThrow('session_end', SentruxSessionEndResultSchema, raw)
    log.info('sentrux:session_end', { sessionId: result.sessionId, issuesDelta: result.issuesDelta })
    return result
  }

  async checkRules(args: Record<string, unknown> = {}): Promise<SentruxCheckRulesResult> {
    const raw = await this.call('check_rules', args)
    const result = parseOrThrow('check_rules', SentruxCheckRulesResultSchema, raw)
    log.info('sentrux:check_rules', { totalCount: result.totalCount })
    return result
  }

  async health(args: Record<string, unknown> = {}): Promise<SentruxHealthResult> {
    const raw = await this.call('health', args)
    const result = parseOrThrow('health', SentruxHealthResultSchema, raw)
    log.info('sentrux:health', { status: result.status, latency_ms: result.latency_ms })
    return result
  }

  async rescan(args: Record<string, unknown> = {}): Promise<SentruxRescanResult> {
    const raw = await this.call('rescan', args)
    const result = parseOrThrow('rescan', SentruxRescanResultSchema, raw)
    log.info('sentrux:rescan', { runId: result.runId, issuesDelta: result.issuesDelta })
    return result
  }

  async evolution(args: Record<string, unknown> = {}): Promise<SentruxEvolutionResult> {
    const raw = await this.call('evolution', args)
    const result = parseOrThrow('evolution', SentruxEvolutionResultSchema, raw)
    log.info('sentrux:evolution', { trend: result.trend, snapshots: result.snapshots.length })
    return result
  }

  async dsm(args: Record<string, unknown> = {}): Promise<SentruxDsmResult> {
    const raw = await this.call('dsm', args)
    const result = parseOrThrow('dsm', SentruxDsmResultSchema, raw)
    log.info('sentrux:dsm', { coupling_score: result.coupling_score, hotspots: result.hotspots.length })
    return result
  }

  async testGaps(args: Record<string, unknown> = {}): Promise<SentruxTestGapsResult> {
    const raw = await this.call('test_gaps', args)
    const result = parseOrThrow('test_gaps', SentruxTestGapsResultSchema, raw)
    log.info('sentrux:test_gaps', { gaps: result.gaps.length, coverage_estimate: result.coverage_estimate })
    return result
  }
}
