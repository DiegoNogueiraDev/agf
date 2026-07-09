export interface Decision {
  verdict: 'approved' | 'rejected'
  reason: string
  toolName: string
}

const APPROVED_RE = /\bAPPROVED[:\s]\s*(.+)/i
const REJECTED_RE = /\bREJECTED[:\s]\s*(.+)/i
const JSON_DECISION_RE = /\{(?:[^{}]|\\\})*"decision"\s*:\s*"(approved|rejected)"(?:[^{}]|\\\})*\}/i

export function extractDecision(output: string): Decision | null {
  const jsonMatch = output.match(JSON_DECISION_RE)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { decision: string; reason?: string }
      if (parsed.decision === 'approved' || parsed.decision === 'rejected') {
        return {
          verdict: parsed.decision,
          reason: parsed.reason ?? '',
          toolName: 'llm',
        }
      }
    } catch {
      /* fall through to text patterns */
    }
  }

  const approvedMatch = output.match(APPROVED_RE)
  if (approvedMatch) {
    return { verdict: 'approved', reason: approvedMatch[1].trim(), toolName: 'llm' }
  }

  const rejectedMatch = output.match(REJECTED_RE)
  if (rejectedMatch) {
    return { verdict: 'rejected', reason: rejectedMatch[1].trim(), toolName: 'llm' }
  }

  return null
}

export function formatDecisionOnly(d: Decision): string {
  const icon = d.verdict === 'approved' ? '✓' : '✗'
  return `${icon} ${d.verdict.toUpperCase()} — ${d.reason} [${d.toolName}]`
}
