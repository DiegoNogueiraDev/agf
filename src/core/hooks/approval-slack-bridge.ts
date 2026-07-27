/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T12 — Approval Slack bridge.
 * Posta approval:required em Slack/Discord webhook. Pure formatting +
 * thin fetch wrapper com timeout e fetch injetável para testes.
 */

export const APPROVAL_SLACK_TIMEOUT_MS = 5_000

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface ApprovalEvent {
  tool: string
  severity: Severity
  reason: string
  matched?: string
  nodeId?: string
  approvalId?: string
}

export interface SlackPayload {
  text: string
  attachments: Array<{
    color: string
    fields: Array<{ title: string; value: string; short: boolean }>
  }>
}

export interface PostApprovalDeps {
  fetch?: typeof globalThis.fetch
  env?: NodeJS.ProcessEnv
}

export interface PostResult {
  posted: boolean
  reason: 'no_webhook' | 'disabled' | 'ok' | 'failed'
  status?: number
}

const SEVERITY_COLORS: Record<Severity, string> = {
  low: '#2eb886',
  medium: '#daa038',
  high: '#e01e5a',
  critical: '#9b1c31',
}

/** isApprovalSlackDisabled —  */
export function isApprovalSlackDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MCP_GRAPH_APPROVAL_SLACK === 'off'
}

/** buildSlackPayload —  */
export function buildSlackPayload(event: ApprovalEvent): SlackPayload {
  const fields = [
    { title: 'Tool', value: event.tool, short: true },
    { title: 'Severity', value: event.severity, short: true },
    { title: 'Reason', value: event.reason, short: false },
  ]
  if (event.matched) fields.push({ title: 'Matched', value: event.matched, short: false })
  if (event.nodeId) fields.push({ title: 'Node', value: event.nodeId, short: true })
  if (event.approvalId) fields.push({ title: 'Approval', value: event.approvalId, short: true })
  return {
    text: `:warning: Approval required: ${event.tool}`,
    attachments: [
      {
        color: SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.medium,
        fields,
      },
    ],
  }
}

/** postApprovalToSlack —  */
export async function postApprovalToSlack(event: ApprovalEvent, deps: PostApprovalDeps = {}): Promise<PostResult> {
  const env = deps.env ?? process.env
  if (isApprovalSlackDisabled(env)) return { posted: false, reason: 'disabled' }

  const url = env.SLACK_WEBHOOK_URL
  if (!url) return { posted: false, reason: 'no_webhook' }

  const fetchImpl = deps.fetch ?? globalThis.fetch
  const payload = buildSlackPayload(event)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), APPROVAL_SLACK_TIMEOUT_MS)
  try {
    const resValue = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return { posted: resValue.ok, reason: resValue.ok ? 'ok' : 'failed', status: resValue.status }
  } catch {
    return { posted: false, reason: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}
