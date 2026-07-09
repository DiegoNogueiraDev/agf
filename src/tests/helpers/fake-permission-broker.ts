/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakePermissionBroker — in-memory permission gate for testing.
 * Allows tests to simulate allow/deny/ask decisions without real user input.
 */

export type PermissionVerdict = 'allow' | 'deny' | 'ask'

export interface PermissionRule {
  id: string
  pattern: RegExp | string
  toolName?: string
  verdict: PermissionVerdict
}

export class FakePermissionBroker {
  private rules: PermissionRule[] = []
  private nextId = 1
  private defaultVerdict: PermissionVerdict = 'ask'
  /** History of all checks for test assertions. */
  private history: Array<{ toolName: string; args: unknown; verdict: PermissionVerdict; timestamp: number }> = []

  addRule(rule: Omit<PermissionRule, 'id'>): string {
    const id = `perm_${this.nextId++}`
    this.rules.push({ ...rule, id })
    return id
  }

  setDefault(verdict: PermissionVerdict): void {
    this.defaultVerdict = verdict
  }

  check(toolName: string, args: unknown): PermissionVerdict {
    for (const rule of this.rules) {
      if (rule.toolName && rule.toolName !== toolName) continue
      const toolStr = `${toolName} ${JSON.stringify(args)}`
      const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : rule.pattern
      if (pattern.test(toolStr)) {
        this.history.push({ toolName, args, verdict: rule.verdict, timestamp: Date.now() })
        return rule.verdict
      }
    }
    this.history.push({ toolName, args, verdict: this.defaultVerdict, timestamp: Date.now() })
    return this.defaultVerdict
  }

  getHistory(): ReadonlyArray<{ toolName: string; args: unknown; verdict: PermissionVerdict; timestamp: number }> {
    return this.history
  }

  reset(): void {
    this.rules = []
    this.history = []
    this.nextId = 1
    this.defaultVerdict = 'ask'
  }
}
