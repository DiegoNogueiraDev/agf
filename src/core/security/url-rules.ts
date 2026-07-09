/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface UrlPolicyConfig {
  allowPatterns?: string[]
  denyPatterns?: string[]
}

export interface UrlPolicy {
  isAllowed(url: string): boolean
  addDenyRule(pattern: string): void
}

function makeMatcher(pattern: string): (url: string) => boolean {
  const hasPrefixWild = pattern.startsWith('*.')
  if (hasPrefixWild) {
    const domainPart = pattern.slice(2).toLowerCase()
    return (url: string) => {
      const lower = url.toLowerCase()
      return lower.includes(`://${domainPart}`) || lower.includes(`.${domainPart}`)
    }
  }

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  const regex = new RegExp(escaped, 'i')
  return (url: string) => regex.test(url)
}

/** Create a URL allow/deny policy from config or environment variables (URL_ALLOW / URL_DENY). */
export function createUrlPolicy(config?: UrlPolicyConfig): UrlPolicy {
  const allowPatterns = config?.allowPatterns ?? parseEnvList('URL_ALLOW')
  const denyPatterns = config?.denyPatterns ?? parseEnvList('URL_DENY')

  const allowMatchers = allowPatterns.map(makeMatcher)
  const denyMatchers = denyPatterns.map(makeMatcher)
  const hasAllowRules = allowMatchers.length > 0

  return {
    isAllowed(url: string): boolean {
      if (hasAllowRules && !allowMatchers.some((m) => m(url))) {
        return false
      }
      if (denyMatchers.some((m) => m(url))) {
        return false
      }
      return true
    },
    addDenyRule(pattern: string): void {
      denyMatchers.push(makeMatcher(pattern))
    },
  }
}

function parseEnvList(key: string): string[] {
  const val = process.env[key]
  if (!val || val.trim() === '') return []
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
