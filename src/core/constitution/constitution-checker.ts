/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Constitution Checker — validates graph nodes against enforceable principles.
 * Analyzes node title + description for keyword matches against principle descriptions.
 */

export interface ConstitutionPrinciple {
  id: string
  title: string
  description: string
  category: string
  weight: number
  enforceable: boolean
}

export interface NodeToCheck {
  id: string
  title: string
  description?: string | null
}

export interface PrincipleViolation {
  principleId: string
  principleTitle: string
  reason: string
}

export interface CheckNodeResult {
  nodeId: string
  principlesChecked: number
  passed: number
  failed: number
  passRate: number
  violations: PrincipleViolation[]
}

export class ConstitutionChecker {
  private readonly enforceablePrinciples: ConstitutionPrinciple[]

  constructor(principles: ConstitutionPrinciple[]) {
    this.enforceablePrinciples = principles.filter((p) => p.enforceable)
  }

  checkNode(node: NodeToCheck): CheckNodeResult {
    const text = `${node.title} ${node.description ?? ''}`.toLowerCase()
    const violations: PrincipleViolation[] = []

    for (const principle of this.enforceablePrinciples) {
      const keywords = this.extractKeywords(principle.description)
      const matched = keywords.filter((kw) => text.includes(kw))

      if (matched.length > 0) {
        violations.push({
          principleId: principle.id,
          principleTitle: principle.title,
          reason: `Node text matches keywords from principle "${principle.title}": ${matched.join(', ')}`,
        })
      }
    }

    const checked = this.enforceablePrinciples.length
    const failed = violations.length
    const passed = checked - failed
    const passRate = checked === 0 ? 100 : Math.round((passed / checked) * 100)

    return {
      nodeId: node.id,
      principlesChecked: checked,
      passed,
      failed,
      passRate,
      violations,
    }
  }

  checkNodes(nodes: NodeToCheck[]): CheckNodeResult[] {
    return nodes.map((node) => this.checkNode(node))
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .filter((word) => !STOP_WORDS.has(word))
  }
}

const STOP_WORDS = new Set([
  'should',
  'would',
  'could',
  'which',
  'where',
  'there',
  'their',
  'about',
  'these',
  'those',
  'after',
  'before',
  'above',
  'below',
  'between',
])
