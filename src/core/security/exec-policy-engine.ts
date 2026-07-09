/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-exec-policy-engine — Pure deterministic exec policy engine.
 * Evaluates commands against declarative rules (prefix, exact, regex, network).
 * Cascade: Forbidden > Prompt > Allow.
 */

import { parse } from 'smol-toml'
import type { ExecPolicyRule, NetworkRule, Decision } from '../../schemas/exec-policy.schema.js'
import { safeCompileRegex } from '../utils/safe-regexp.js'

export interface ExecPolicyResult {
  decision: Decision
  rule: ExecPolicyRule | NetworkRule
}

export class ExecPolicyEngine {
  private rules: ExecPolicyRule[] = []
  private networkRules: NetworkRule[] = []

  constructor(config?: { rules?: ExecPolicyRule[]; networkRules?: NetworkRule[] }) {
    if (config) {
      this.loadRules(config)
    }
  }

  loadRules(config: { rules?: ExecPolicyRule[]; networkRules?: NetworkRule[] }): void {
    if (config.rules) this.rules = [...config.rules]
    if (config.networkRules) this.networkRules = [...config.networkRules]
  }

  loadFromToml(tomlStr: string): void {
    const parsed = parse(tomlStr) as {
      rules?: Array<{
        type: string
        value: string | string[]
        decision: string
        justification?: string
      }>
      network_rules?: Array<{
        domain: string
        protocol: string
        decision: string
      }>
    }

    const rules: ExecPolicyRule[] = (parsed.rules || []).map((r) => ({
      type: r.type as 'prefix' | 'exact' | 'regex',
      value: r.value,
      decision: r.decision as Decision,
      justification: r.justification,
    }))

    const networkRules: NetworkRule[] = (parsed.network_rules || []).map((r) => ({
      domain: r.domain,
      protocol: (r.protocol || 'all') as 'https' | 'http' | 'tcp' | 'all',
      decision: r.decision as 'Allow' | 'Deny',
    }))

    this.loadRules({ rules, networkRules })
  }

  check(command: string, _cwd?: string): ExecPolicyResult | null {
    const trimmed = command.trim()
    if (!trimmed) return null

    const directResult = this.matchCommand(trimmed)
    if (directResult) return directResult

    const subCommands = this.extractSubCommands(trimmed)
    for (const sub of subCommands) {
      const result = this.matchCommand(sub)
      if (result) return result
    }

    return this.matchNetwork(trimmed)
  }

  private extractSubCommands(command: string): string[] {
    const results: string[] = []

    const shellRe = /(?:bash|sh|zsh|ksh|dash)\s+(?:-[a-zA-Z]+\s+)*-c\s+["'](.+?)["']/i
    const shellMatch = command.match(shellRe)
    if (shellMatch) results.push(shellMatch[1].trim())

    const psRe = /powershell\s+-Command\s+["'](.+?)["']/i
    const psMatch = command.match(psRe)
    if (psMatch) results.push(psMatch[1].trim())

    return results
  }

  private matchCommand(cmd: string): ExecPolicyResult | null {
    const trimmed = cmd.trim()
    const priority: Record<Decision, number> = { Forbidden: 3, Prompt: 2, Allow: 1 }

    let best: { decision: Decision; rule: ExecPolicyRule } | null = null

    for (const rule of this.rules) {
      let matched = false

      if (rule.type === 'prefix') {
        const prefixStr = Array.isArray(rule.value) ? rule.value.join(' ') : rule.value
        if (trimmed === prefixStr || trimmed.startsWith(prefixStr + ' ')) {
          matched = true
        }
      } else if (rule.type === 'exact') {
        if (trimmed === rule.value) {
          matched = true
        }
      } else if (rule.type === 'regex') {
        const re = safeCompileRegex(rule.value as string)
        if (re && re.test(trimmed)) matched = true
      }

      if (matched) {
        if (!best || priority[rule.decision] > priority[best.decision]) {
          best = { decision: rule.decision, rule }
        }
      }
    }

    return best
  }

  private matchNetwork(command: string): ExecPolicyResult | null {
    const urlRe = /https?:\/\/[^\s"'`]+/g
    const urls = command.match(urlRe) || []

    const domainRe = /\b(?:curl|wget)\s+([a-zA-Z0-9](?:[a-zA-Z0-9-]*\.)+[a-zA-Z]{2,})/g
    const bareDomains: string[] = []
    let dm: RegExpExecArray | null
    while ((dm = domainRe.exec(command)) !== null) {
      bareDomains.push(dm[1])
    }

    const targets = [...urls, ...bareDomains]

    for (const target of targets) {
      let hostname: string
      try {
        hostname = target.startsWith('http') ? new URL(target).hostname : target
      } catch {
        continue
      }

      for (const nr of this.networkRules) {
        if (hostname === nr.domain || hostname.endsWith('.' + nr.domain)) {
          const decision: Decision = nr.decision === 'Deny' ? 'Forbidden' : 'Allow'
          return { decision, rule: nr }
        }
      }
    }

    return null
  }

  updateRules(newRules: ExecPolicyRule[]): void {
    this.rules = [...newRules]
  }
}
