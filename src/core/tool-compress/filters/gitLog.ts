/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * git-log — colapsa o formato verboso de `git log` (commit/Author/Date/corpo) em
 * uma linha por commit: `<hash7> <assunto>`. O agente quase sempre só precisa do
 * assunto + hash; Author/Date/corpo são ruído previsível. Determinístico, 0 token.
 * (O formato `--oneline` já é compacto e não é detectado/alterado.)
 */
const RE_COMMIT = /^commit ([0-9a-f]{7,40})\b/
const RE_META = /^(Author|AuthorDate|Commit|CommitDate|Date|Merge):/

interface Commit {
  hash: string
  subject: string
}

/** Compress `git log` output — collapses verbose commit entries (Author/Date/body) to one line per commit: `<hash7> <subject>`. */
export function gitLog(input: string): string {
  const commits: Commit[] = []
  let cur: Commit | null = null
  let sawBlank = false

  for (const line of input.split('\n')) {
    const m = RE_COMMIT.exec(line)
    if (m) {
      cur = { hash: m[1].slice(0, 7), subject: '' }
      commits.push(cur)
      sawBlank = false
      continue
    }
    if (!cur) continue
    if (RE_META.test(line)) continue
    if (line.trim() === '') {
      sawBlank = true
      continue
    }
    // 1ª linha não-vazia após os metadados (corpo indentado) = assunto.
    if (!cur.subject && sawBlank) cur.subject = line.trim()
  }

  if (commits.length === 0) return input
  const out = commits.map((c) => (c.subject ? `${c.hash} ${c.subject}` : c.hash)).join('\n')
  return out.length > 0 && out.length < input.length ? out : input
}

gitLog.filterName = 'git-log'
