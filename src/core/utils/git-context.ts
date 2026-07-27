import { execFileSync } from 'node:child_process'

const ALLOWED_HOSTS = new Set(['github.com', 'gitlab.com', 'gitee.com', 'bitbucket.org', 'codeberg.org', 'sr.ht'])

function execGit(args: string[], cwd?: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

function sanitizeUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!ALLOWED_HOSTS.has(u.hostname)) return null
    u.password = ''
    u.username = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return url.replace(/\/\/.*@/, '//')
  }
}

function execRemote(cwd?: string): string | null {
  const url = execGit(['remote', 'get-url', 'origin'], cwd)
  return url ? sanitizeUrl(url) : null
}

function execBranch(cwd?: string): string | null {
  return execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
}

function execDirtyFiles(cwd?: string): [string[], boolean] {
  const out = execGit(['status', '--porcelain'], cwd)
  if (!out) return [[], false]
  const files = out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
  return [files.slice(0, 20), files.length > 20]
}

function execRecentCommits(cwd?: string): Array<{ hash: string; subject: string }> {
  const out = execGit(['log', '--oneline', '-3'], cwd)
  if (!out) return []
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const sp = line.indexOf(' ')
      return {
        hash: sp > 0 ? line.slice(0, sp) : line,
        subject: sp > 0 ? line.slice(sp + 1).slice(0, 200) : '',
      }
    })
}

export interface GitContext {
  remote: string | null
  branch: string | null
  dirtyFiles: string[]
  dirtyTruncated: boolean
  recentCommits: Array<{ hash: string; subject: string }>
}

/** Collect git context (remote, branch, dirty files, recent commits) for `cwd`. All fields are null-safe — returns empty arrays on git errors. */
export function collectGitContext(cwd?: string): GitContext {
  const [dirty, dirtyTruncated] = execDirtyFiles(cwd)
  return {
    remote: execRemote(cwd),
    branch: execBranch(cwd),
    dirtyFiles: dirty,
    dirtyTruncated,
    recentCommits: execRecentCommits(cwd),
  }
}

/** Serialize a GitContext to an XML block readable by Claude/LLM system prompts. Escapes all values for XML safety. */
export function formatGitContextXml(ctx: GitContext): string {
  const lines: string[] = ['<git-context>']
  if (ctx.remote) lines.push(`  <origin>${esc(ctx.remote)}</origin>`)
  if (ctx.branch) lines.push(`  <branch>${esc(ctx.branch)}</branch>`)
  if (ctx.dirtyFiles.length > 0) {
    lines.push('  <dirty-files>')
    for (const f of ctx.dirtyFiles) lines.push(`    <file>${esc(f)}</file>`)
    if (ctx.dirtyTruncated) lines.push(`    <truncated>and more</truncated>`)
    lines.push('  </dirty-files>')
  }
  if (ctx.recentCommits.length > 0) {
    lines.push('  <recent-commits>')
    for (const c of ctx.recentCommits) {
      lines.push(`    <commit hash="${esc(c.hash)}">${esc(c.subject)}</commit>`)
    }
    lines.push('  </recent-commits>')
  }
  lines.push('</git-context>')
  return lines.join('\n')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
