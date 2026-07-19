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

/**
 * Parse the lowercased hostname from a URL. Returns null when the URL cannot be parsed —
 * an unparseable URL must not silently match a clean domain rule. Binding domain rules to
 * the parsed host (not a raw-string search) is what prevents suffix-confusion and
 * path/query/fragment injection bypasses (node_c3a69c5dd92d).
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function makeMatcher(pattern: string): (url: string) => boolean {
  const hasPrefixWild = pattern.startsWith('*.')
  if (hasPrefixWild) {
    const domainPart = pattern.slice(2).toLowerCase()
    // Bind to the URL HOST with a label boundary: the host is the domain itself (apex) or a
    // subdomain of it. A raw .includes() let `example.com.evil.com` and a marker planted in
    // the path/query/fragment slip through the allow-list (SSRF-class egress bypass).
    return (url: string) => {
      const host = hostOf(url)
      if (host === null) return false
      return host === domainPart || host.endsWith(`.${domainPart}`)
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
