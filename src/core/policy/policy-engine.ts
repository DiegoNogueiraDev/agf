export type GreenLevel = 'targeted' | 'package' | 'workspace' | 'merge_ready'

export interface AtomicCondition {
  greenAt?: GreenLevel
  stal?: boolean
  reviewPassed?: boolean
  approvalTokenPresent?: string
  emptyGraph?: boolean
  hasRequirements?: boolean
  oversized?: boolean
  hasReadyTasks?: boolean
  hasInProgress?: boolean
  allDone?: boolean
  allBlocked?: boolean
}

export interface ContextInput {
  greenLevel?: GreenLevel
  stal?: boolean
  reviewPassed?: boolean
  approvalTokenPresent?: string
  totalNodes?: number
  hasRequirements?: boolean
  oversizedCount?: number
  readyTasks?: number
  inProgress?: number
  doneRatio?: number
  allBlocked?: boolean
}

export type PolicyAction =
  | { type: 'import_prd' }
  | { type: 'decompose' }
  | { type: 'implement' }
  | { type: 'escalate' }
  | { type: 'done' }
  | { type: 'continue' }
  | { type: 'merge' }
  | { type: 'recover' }
  | { type: 'cleanup' }
  | { type: 'block' }

export type PolicyCondition =
  AtomicCondition | { all: PolicyCondition[] } | { any: PolicyCondition[] } | { not: PolicyCondition }

export interface PolicyRule {
  name: string
  condition: PolicyCondition
  actions: PolicyAction[]
  priority: number
}

export interface EvaluationResult {
  ruleName: string
  actions: PolicyAction[]
}

function matchesAtomic(cond: AtomicCondition, ctx: ContextInput): boolean {
  if (cond.greenAt !== undefined) {
    const levels: GreenLevel[] = ['targeted', 'package', 'workspace', 'merge_ready']
    const ctxIdx = levels.indexOf(ctx.greenLevel ?? 'targeted')
    const condIdx = levels.indexOf(cond.greenAt)
    if (ctxIdx < condIdx) return false
  }
  if (cond.stal !== undefined && ctx.stal !== cond.stal) return false
  if (cond.reviewPassed !== undefined && ctx.reviewPassed !== cond.reviewPassed) return false
  if (cond.approvalTokenPresent !== undefined && ctx.approvalTokenPresent !== cond.approvalTokenPresent) return false
  if (cond.emptyGraph !== undefined && (ctx.totalNodes ?? 0) > 0 === cond.emptyGraph) return false
  if (cond.hasRequirements !== undefined && ctx.hasRequirements !== cond.hasRequirements) return false
  if (cond.oversized !== undefined && (ctx.oversizedCount ?? 0) > 0 !== cond.oversized) return false
  if (cond.hasReadyTasks !== undefined && (ctx.readyTasks ?? 0) > 0 !== cond.hasReadyTasks) return false
  if (cond.hasInProgress !== undefined && (ctx.inProgress ?? 0) > 0 !== cond.hasInProgress) return false
  if (cond.allDone !== undefined && (ctx.doneRatio ?? 0) >= 1 !== cond.allDone) return false
  if (cond.allBlocked !== undefined && ctx.allBlocked !== cond.allBlocked) return false
  return true
}

function evaluateCondition(cond: PolicyCondition, ctx: ContextInput): boolean {
  if ('all' in cond) return cond.all.every((c) => evaluateCondition(c, ctx))
  if ('any' in cond) return cond.any.some((c) => evaluateCondition(c, ctx))
  if ('not' in cond) return !evaluateCondition(cond.not, ctx)
  return matchesAtomic(cond as AtomicCondition, ctx)
}

export class PolicyEngine {
  private rules: PolicyRule[]

  constructor(rules: PolicyRule[] = []) {
    this.rules = [...rules].sort((a, b) => b.priority - a.priority)
  }

  evaluate(ctx: ContextInput): EvaluationResult {
    for (const rule of this.rules) {
      if (evaluateCondition(rule.condition, ctx)) {
        return { ruleName: rule.name, actions: [...rule.actions] }
      }
    }
    return { ruleName: '__fallthrough', actions: [] }
  }

  static defaultRules(): PolicyRule[] {
    return [
      {
        name: 'import_prd',
        condition: { any: [{ emptyGraph: true }, { hasRequirements: false }] },
        actions: [{ type: 'import_prd' }],
        priority: 100,
      },
      {
        name: 'decompose',
        condition: { oversized: true },
        actions: [{ type: 'decompose' }],
        priority: 90,
      },
      {
        name: 'implement',
        condition: { any: [{ hasReadyTasks: true }, { hasInProgress: true }] },
        actions: [{ type: 'implement' }],
        priority: 80,
      },
      {
        name: 'done',
        condition: { allDone: true },
        actions: [{ type: 'done' }],
        priority: 70,
      },
      {
        name: 'escalate',
        condition: { allBlocked: true },
        actions: [{ type: 'escalate' }],
        priority: 60,
      },
      {
        name: 'fallback_escalate',
        condition: {},
        actions: [{ type: 'escalate' }],
        priority: 1,
      },
    ]
  }
}
