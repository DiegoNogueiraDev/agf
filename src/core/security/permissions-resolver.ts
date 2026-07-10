import { resolve as resolvePath } from 'node:path'
import type {
  FileSystemSandboxPolicy,
  FileSystemSandboxEntry,
  FileSystemAccessMode,
} from '../../schemas/permissions.schema.js'

export const PROTECTED_METADATA_NAMES = ['.git', '.agents', '.codex']

const _ACCESS_PRECEDENCE: Record<string, number> = { Deny: 3, Write: 2, Read: 1 }

/** Return true when the absolute path contains a protected metadata directory (.git, .agents, .codex). */
export function isMetadataProtected(absPath: string): boolean {
  const segments = absPath.split('/')
  return PROTECTED_METADATA_NAMES.some((name) => segments.includes(name))
}

function resolveCandidatePath(path: string, cwd: string): string | null {
  if (path.startsWith('/')) return path
  try {
    return resolvePath(cwd, path)
  } catch {
    return null
  }
}

function _getEntryPathString(entry: FileSystemSandboxEntry): string {
  const p = entry.path
  if (p.type === 'Path') return p.path
  if (p.type === 'Special') {
    if (p.value === 'Root') return '/'
    if (p.value === 'Tmpdir') return '/tmp'
    if (p.value === 'SlashTmp') return '/tmp'
    return '/'
  }
  return ''
}

function matchesGlob(pattern: string, targetPath: string): boolean {
  try {
    const regexStr = '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$'
    return new RegExp(regexStr).test(targetPath)
  } catch {
    return false
  }
}

function entryMatchesPath(entry: FileSystemSandboxEntry, absPath: string): boolean {
  const p = entry.path
  if (p.type === 'Path') {
    return absPath.startsWith(p.path)
  }
  if (p.type === 'GlobPattern') {
    return matchesGlob(p.pattern, absPath)
  }
  if (p.type === 'Special') {
    if (p.value === 'Root') return absPath.startsWith('/')
    if (p.value === 'Minimal') return absPath.startsWith('/') && !absPath.startsWith('/dev')
    if (p.value === 'Tmpdir') return absPath.startsWith('/tmp')
    if (p.value === 'SlashTmp') return absPath.startsWith('/tmp')
    if (p.value === 'ProjectRoots') return true
    return false
  }
  return false
}

function resolvedEntryPrecedence(entry: FileSystemSandboxEntry): number {
  const p = entry.path
  if (p.type === 'Path') return p.path.length
  if (p.type === 'Special' && p.value === 'ProjectRoots') return 9999
  if (p.type === 'Special') return 100
  if (p.type === 'GlobPattern') return p.pattern.length
  return 0
}

/** Resolve the effective filesystem access mode for a path given a sandbox policy; returns 'Deny', 'Read', or 'Write'. */
export function resolveAccess(path: string, cwd: string, policy: FileSystemSandboxPolicy): FileSystemAccessMode {
  if (policy.kind === 'Unrestricted' || policy.kind === 'ExternalSandbox') {
    return 'Write'
  }

  const absPath = resolveCandidatePath(path, cwd)
  if (!absPath) return 'Deny'

  const matching = (policy.entries ?? []).filter((entry) => entryMatchesPath(entry, absPath))
  if (matching.length === 0) return 'Deny'

  matching.sort((a, b) => resolvedEntryPrecedence(b) - resolvedEntryPrecedence(a))
  const best = matching[0]!

  const access = best.access as FileSystemAccessMode

  if (access === 'Write' && isMetadataProtected(absPath)) {
    return 'Deny'
  }

  return access
}

/** Return true when the policy allows at least Read access to the given path. */
export function canReadPath(path: string, cwd: string, policy: FileSystemSandboxPolicy): boolean {
  const access = resolveAccess(path, cwd, policy)
  return access === 'Read' || access === 'Write'
}

/** Return true when the policy allows Write access to the given path. */
export function canWritePath(path: string, cwd: string, policy: FileSystemSandboxPolicy): boolean {
  const access = resolveAccess(path, cwd, policy)
  return access === 'Write'
}
