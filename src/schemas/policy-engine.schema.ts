/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §T2 — Composable Policy Engine com And/Or/Not conditions.
 * Inspirado no claw-code (Rust) PolicyEngine adaptado para TypeScript.
 */

export interface AtomicCondition {
  greenAt?: string
  reviewPassed?: boolean
  approvalTokenPresent?: boolean
  staleBranch?: boolean
}

export interface PolicyCondition {
  all?: PolicyCondition[]
  any?: PolicyCondition[]
  not?: PolicyCondition
  greenAt?: string
  reviewPassed?: boolean
  approvalTokenPresent?: boolean
  staleBranch?: boolean
}

export interface PolicyRule {
  condition: PolicyCondition
  actions: string[]
  priority: number
}

export interface PolicyContext {
  greenLevel?: string
  reviewStatus?: string
  hasApprovalToken?: boolean
  isStaleBranch?: boolean
}

export class PolicyEngine {
  evaluate(rules: PolicyRule[], context: PolicyContext): string[] {
    const sorted = [...rules].sort((a, b) => b.priority - a.priority)

    for (const rule of sorted) {
      if (this.evaluateCondition(rule.condition, context)) {
        return rule.actions
      }
    }

    return []
  }

  private evaluateCondition(condition: PolicyCondition, context: PolicyContext): boolean {
    if (condition.all !== undefined) {
      return condition.all.every((sub) => this.evaluateCondition(sub, context))
    }

    if (condition.any !== undefined) {
      return condition.any.some((sub) => this.evaluateCondition(sub, context))
    }

    if (condition.not !== undefined) {
      return !this.evaluateCondition(condition.not, context)
    }

    return this.evaluateAtomic(condition, context)
  }

  private evaluateAtomic(condition: PolicyCondition, context: PolicyContext): boolean {
    if (condition.greenAt !== undefined) {
      return context.greenLevel === condition.greenAt
    }

    if (condition.reviewPassed !== undefined) {
      if (condition.reviewPassed) {
        return context.reviewStatus === 'passed'
      }
      return context.reviewStatus !== 'passed'
    }

    if (condition.approvalTokenPresent !== undefined) {
      if (condition.approvalTokenPresent) {
        return context.hasApprovalToken === true
      }
      return context.hasApprovalToken !== true
    }

    if (condition.staleBranch !== undefined) {
      return context.isStaleBranch === condition.staleBranch
    }

    return false
  }
}
