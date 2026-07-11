export type Effect = 'allow' | 'deny' | 'ask'

export interface Rule {
  action: string
  resource: string
  effect: Effect
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___GLOBSTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOBSTAR___/g, '.*')
  return new RegExp(`^${escaped}$`).test(value)
}

export function evaluateRuleset(rules: Rule[], action: string, resource: string): Effect {
  let result: Effect = 'deny'
  for (const rule of rules) {
    if (!globMatch(rule.action, action)) continue
    if (!globMatch(rule.resource, resource)) continue
    result = rule.effect
  }
  return result
}

const SUBTASK_DENY_DEFAULTS: Rule[] = [
  { action: 'todowrite', resource: '*', effect: 'deny' },
  { action: 'task', resource: '*', effect: 'deny' },
]

export function deriveRuleset(parentRules: Rule[], childRules: Rule[]): Rule[] {
  const parentDeny: Rule[] = parentRules.filter((r) => r.effect === 'deny')

  function isBlockedByParent(action: string, resource: string): boolean {
    for (const p of parentDeny) {
      if (globMatch(p.action, action) && globMatch(p.resource, resource)) return true
    }
    return false
  }

  const merged = [...parentRules, ...SUBTASK_DENY_DEFAULTS]

  for (const cr of childRules) {
    if (isBlockedByParent(cr.action, cr.resource)) continue
    merged.push(cr)
  }

  return merged
}
