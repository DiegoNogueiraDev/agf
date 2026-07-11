/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The local-first contract, enforced instead of promised.
 *
 * agf must not talk to the network unless the user asked it to. "Asked it to"
 * means exactly two things: choosing an LLM provider, or running `agf upgrade`.
 * Everything else — starting the CLI, finishing a task — must be observably
 * offline.
 *
 * WHY a test and not a README line: an unsolicited request is invisible in code
 * review. It hides behind `void fireAndForget()` at the bottom of a command, or
 * an `import()` inside a `try {}` that swallows its own failure. Both existed
 * here: the CLI pinged a release server on every invocation, and `agf done`
 * POSTed an OS/arch/terminal fingerprint. Neither was reachable from a diff of
 * the feature that introduced it.
 *
 * This file is the tripwire. If someone reintroduces a call-home, it fails.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

/** Every tracked TypeScript file under src/, as paths. */
function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !f.startsWith('src/tests/'))
}

/**
 * The complete list of modules allowed to originate an outbound request, each with
 * the user action that triggers it. This is an allowlist by design: a directory glob
 * would silently bless the next file dropped into it, which is exactly how the
 * startup notifier survived review.
 *
 * Adding an entry here is a deliberate act. If you cannot name the command a user
 * types to reach it, it does not belong.
 */
const NETWORK_ALLOWED: ReadonlyArray<readonly [RegExp, string]> = [
  [/^src\/core\/model-hub\//, 'the user selected an LLM provider (`agf provider use`)'],
  [/^src\/core\/llm\//, 'ditto — the provider gateway'],
  [/^src\/core\/upgrade\//, '`agf upgrade`, typed by the user'],
  [/^src\/cli\/commands\/upgrade-cmd\.ts$/, '`agf upgrade` — the fetch/fs wiring'],
  [/^src\/cli\/commands\/scan-binaries-cmd\.ts$/, '`agf scan-binaries` — release verification, on demand'],
  [/^src\/core\/doctor\/provider-ping\.ts$/, '`agf doctor --providers` — reachability probe, on demand'],
  [/^src\/core\/mcp\//, 'MCP transport — only when an MCP server is configured'],
  [/^src\/core\/docs\/mcp-context7-fetcher\.ts$/, 'doc lookup through a user-configured MCP server'],
  [/^src\/core\/rag\/model-downloader\.ts$/, 'embedding model download, on first RAG use'],
  [/^src\/core\/scaffolder\/github-corpus\.ts$/, '`agf skill new` — corpus fetch, on demand'],
  [/^src\/core\/memory\/honcho-provider\.ts$/, 'opt-in external memory provider'],
  [/^src\/core\/integrations\/serena-health\.ts$/, 'probes a Serena MCP server the user is running'],
  [/^src\/core\/code\/taint-lite\.ts$/, 'names `fetch(` as a taint SOURCE in its analysis table'],
  [
    /^src\/core\/web\/views\/progress-panels\.ts$/,
    'emits browser-side JS; the fetch runs in the page, against localhost',
  ],
  [/^src\/tui\/cdp-browser-port\.ts$/, 'talks to a local Chrome DevTools endpoint'],
  [/^src\/plugins\//, 'opt-in plugins'],
  [/^src\/web\//, 'the dashboard, running in the user’s browser against localhost'],
  [/^src\/api\//, 'the local API server'],
  [/^src\/mcp\//, 'the optional MCP transport'],
]

describe('local-first: no unsolicited network', () => {
  it('the CLI entry point performs no network call at startup or shutdown', () => {
    const entry = readFileSync('src/cli/index.ts', 'utf8')
    expect(entry).not.toMatch(/update-notify/)
    expect(entry).not.toMatch(/maybeNotifyUpdate/)
    expect(entry).not.toMatch(/\bfetch\s*\(/)
  })

  it('`agf done` reports nothing to any server', () => {
    const done = readFileSync('src/cli/commands/done-cmd.ts', 'utf8')
    expect(done).not.toMatch(/fireFeedbackOutcome/)
    expect(done).not.toMatch(/feedback-wire/)
    expect(done).not.toMatch(/\bfetch\s*\(/)
  })

  it('no module collects a machine fingerprint', () => {
    const offenders = sourceFiles().filter((f) =>
      /machine-metadata|collectMachineMetadata/.test(readFileSync(f, 'utf8')),
    )
    expect(offenders, 'a machine fingerprint must not exist anywhere').toEqual([])
  })

  it('no module outside the explicit egress points calls fetch', () => {
    const offenders = sourceFiles()
      .filter((f) => !NETWORK_ALLOWED.some(([re]) => re.test(f)))
      .filter((f) => /\bfetch\s*\(/.test(readFileSync(f, 'utf8')))
    expect(offenders, 'every outbound call must live in a user-initiated module').toEqual([])
  })

  it('no credential is compiled into the binary', () => {
    // A write token used to live in feedback-client.ts, handed to every user and
    // impossible to rotate without a release. The pattern is written by shape rather
    // than by value: naming the old token here would publish it again.
    const CREDENTIAL_SHAPE =
      /(?:^|[^a-z])(?:agf_[a-z]{2}_[a-z]{3}_[a-f0-9]{16,}|sk-[A-Za-z0-9]{24,}|ghp_[A-Za-z0-9]{20,})/
    const offenders = sourceFiles().filter((f) => CREDENTIAL_SHAPE.test(readFileSync(f, 'utf8')))
    expect(offenders, 'a token in the source is a token handed to every user').toEqual([])
  })

  it('the release host appears in exactly three files, all user-initiated', () => {
    // `agf upgrade` and the two installers reach the author's release host, so
    // they disclose an IP. That is a knowing trade, made once, in three places a
    // reviewer can read. Anywhere else, the same hostname means telemetry.
    const RELEASE_CHANNEL = [
      'src/core/upgrade/upgrade.ts',
      'scripts/install-agf-standalone.sh',
      'scripts/install-agf.ps1',
    ]
    const offenders = sourceFiles().filter(
      (f) => !RELEASE_CHANNEL.includes(f) && /graph-flow\.cloud/.test(readFileSync(f, 'utf8')),
    )
    expect(offenders, 'only the release channel may name the release host').toEqual([])

    for (const f of RELEASE_CHANNEL) {
      expect(readFileSync(f, 'utf8'), `${f} must be overridable`).toMatch(/AGF_RELEASES_BASE/)
    }
  })

  it('the release host is never reached without an explicit command', () => {
    // The startup notifier hit this host on every `agf` invocation. Its absence is
    // the whole point; assert it at the two entry points a user cannot avoid.
    expect(readFileSync('src/cli/index.ts', 'utf8')).not.toMatch(/graph-flow\.cloud/)
    expect(readFileSync('src/cli/commands/done-cmd.ts', 'utf8')).not.toMatch(/graph-flow\.cloud/)
  })
})
