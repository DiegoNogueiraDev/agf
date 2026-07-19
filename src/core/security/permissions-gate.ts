import { resolve as resolvePath } from 'node:path'
import { resolveAccess, canReadPath, canWritePath, isMetadataProtected } from './permissions-resolver.js'
import type { FileSystemSandboxPolicy, NetworkSandboxPolicy } from '../../schemas/permissions.schema.js'

export type SafetyCheck = 'AutoApprove' | 'AskUser' | 'Reject'

export interface GateResult {
  allowed: boolean
  reason?: string
}

export interface CheckCommandInput {
  command: string
  cwd: string
}

export interface CheckPathInput {
  path: string
  cwd: string
  policy: FileSystemSandboxPolicy
}

const URL_RE = /https?:\/\/([a-zA-Z0-9.-]+)(?:\/|:|\s|$)/g

function extractUrls(input: string): string[] {
  const urls: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(URL_RE)
  while ((match = re.exec(input)) !== null) {
    urls.push(match[1]!)
  }
  return urls
}

/**
 * Unwrap a shell token so the gate sees the path inside it: strip a leading `--flag=` and any
 * surrounding quotes. Without this, `rm -rf "/etc/passwd"` and `--out=/etc/x` slipped past the
 * prefix check and the gate never validated the path — a bypass to a denied location.
 */
function unwrapToken(token: string): string {
  let t = token
  const eq = t.indexOf('=')
  if (eq > 0 && t.slice(0, eq).startsWith('-')) t = t.slice(eq + 1)
  return t.replace(/^['"]+/, '').replace(/['"]+$/, '')
}

function extractPaths(input: string): string[] {
  const paths: string[] = []
  for (const rawToken of input.split(/\s+/)) {
    const token = unwrapToken(rawToken)
    if (!token) continue
    const isAbsOrDotRelative = token.startsWith('/') || token.startsWith('./') || token.startsWith('../')
    // Any token that traverses upward (contains `../` or `/..`) is a path the gate must
    // resolve+check, even without a leading dot (e.g. `sub/../../../etc/passwd`).
    const hasTraversal = token.includes('../') || token.includes('/..')
    if (isAbsOrDotRelative || hasTraversal) {
      paths.push(token)
    }
  }
  return paths
}

function hasNetworkUsage(command: string): boolean {
  const networkCmds = /\b(curl|wget|nc|netcat|ssh|scp|rsync|ftp|sftp|telnet|ping|nslookup|dig|nmap|traceroute)\b/i
  const urls = extractUrls(command)
  return networkCmds.test(command) || urls.length > 0
}

export class PermissionsGate {
  private readonly fsPolicy: FileSystemSandboxPolicy
  private readonly networkPolicy: NetworkSandboxPolicy

  constructor(fsPolicy: FileSystemSandboxPolicy, networkPolicy: NetworkSandboxPolicy) {
    this.fsPolicy = fsPolicy
    this.networkPolicy = networkPolicy
  }

  check(input: CheckCommandInput): GateResult {
    const { command, cwd } = input

    if (hasNetworkUsage(command)) {
      if (this.networkPolicy.kind !== 'Enabled') {
        return { allowed: false, reason: 'network_restricted' }
      }

      const domains = extractUrls(command)
      for (const domain of domains) {
        const action = this.networkPolicy.domains?.[domain]
        if (action === 'Deny') {
          return { allowed: false, reason: `domain_denied: ${domain}` }
        }
      }
    }

    const paths = extractPaths(command)
    for (const path of paths) {
      try {
        const resolved = resolvePath(cwd, path)
        const access = resolveAccess(resolved, cwd, this.fsPolicy)

        if (access === 'Deny') {
          return { allowed: false, reason: `path_denied: ${path}` }
        }
        if (access === 'Read' && path !== cwd && hasWriteIntent(command, path)) {
          return { allowed: false, reason: `read_only_path: ${path}` }
        }
      } catch {
        return { allowed: false, reason: 'path_resolution_error' }
      }
    }

    return { allowed: true }
  }

  checkRead(path: string, cwd: string): GateResult {
    const allowed = canReadPath(path, cwd, this.fsPolicy)
    if (!allowed) {
      return { allowed: false, reason: isMetadataProtected(path) ? 'metadata_protected' : 'path_denied' }
    }
    return { allowed: true }
  }

  checkWrite(path: string, cwd: string): GateResult {
    const allowed = canWritePath(path, cwd, this.fsPolicy)
    if (!allowed) {
      return { allowed: false, reason: isMetadataProtected(path) ? 'metadata_protected' : 'path_denied' }
    }
    return { allowed: true }
  }

  extractPaths(command: string): string[] {
    return extractPaths(command)
  }

  extractUrls(command: string): string[] {
    return extractUrls(command)
  }
}

function hasWriteIntent(command: string, _path: string): boolean {
  const writeCmds = /\b(rm|mv|cp|chmod|chown|dd|truncate|cat\s.*>|echo\s.*>>?|sed\s+-i|tee|install|ln|mkfs|mount)\b/i
  return writeCmds.test(command)
}

/** Assess whether a path-modifying operation is safe under the current permissions policy. */
export function assessPatchSafety(input: CheckPathInput): SafetyCheck {
  const { path, cwd, policy } = input

  if (isMetadataProtected(path)) {
    return 'Reject'
  }

  const access = resolveAccess(path, cwd, policy)

  if (access === 'Write') {
    return 'AutoApprove'
  }

  if (access === 'Deny') {
    if (isExplicitlyDenied(path, cwd, policy)) {
      return 'Reject'
    }
    return 'AskUser'
  }

  return 'AskUser'
}

function isExplicitlyDenied(path: string, cwd: string, policy: FileSystemSandboxPolicy): boolean {
  if (policy.kind !== 'Restricted') return false

  for (const entry of policy.entries ?? []) {
    const p = entry.path
    if (p.type === 'Path' && path.startsWith(p.path) && entry.access === 'Deny') {
      return true
    }
    if (p.type === 'Special' && p.value === 'Root' && entry.access === 'Deny') return true
  }
  return false
}
