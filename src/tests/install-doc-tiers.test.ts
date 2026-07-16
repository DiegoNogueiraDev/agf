/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Static contract test for INSTALL.md (node_600107b0a91c): the doc must cover
 * macOS/Linux/Windows, each with a working one-liner (tier 1) and an npm
 * fallback (tier 2), and must be honest about the not-yet-shipped GUI
 * installers (tier 3 AppImage/.deb, tier 4 .pkg) — flagged as upcoming, never
 * presented as available today (those artifacts don't exist until
 * node_d02c01bd85a4 / node_3c6a66fd217b ship).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DOC = join(process.cwd(), 'INSTALL.md')
const doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : ''

describe('INSTALL.md — per-OS tiered installation doc', () => {
  it('exists', () => {
    expect(existsSync(DOC)).toBe(true)
  })

  it('has a section for each of macOS, Linux, and Windows', () => {
    expect(doc).toMatch(/## macOS/)
    expect(doc).toMatch(/## Linux/)
    expect(doc).toMatch(/## Windows/)
  })

  it('documents the real one-liner installers (tier 1) for each OS', () => {
    expect(doc).toContain('curl -fsSL https://graph-flow.cloud/install.sh | bash')
    expect(doc).toContain('irm https://graph-flow.cloud/install.ps1 | iex')
  })

  it('never offers a hand-downloadable binary or archive', () => {
    // The security confusion this doc caused came from a "prefer clicking?" tier
    // that told the reader to download an unsigned .exe and click through
    // SmartScreen. Teaching a user to dismiss that warning is the whole harm.
    expect(doc).not.toMatch(/duplo-clique.*\.exe|\.exe.*duplo-clique/i)
    expect(doc).not.toMatch(/Executar assim mesmo/i)
    expect(doc).not.toMatch(/Baixe o `?agf-setup/i)
    // An archive may be *named* (to say it is not offered); it may not be linked
    // or handed to the reader as a code block to run.
    expect(doc).not.toMatch(/\]\([^)]*\.zip/i)
    expect(doc).not.toMatch(/`[^`\n]*\.zip[^`\n]*`/i)
  })

  it('discloses what the release host can see, and how to avoid it', () => {
    // The install and `agf upgrade` reach the author's host, so it observes an IP.
    // A doc that omits this while promising "local-first" is the dishonest kind of
    // reassurance. Say it, and give the reader the override.
    expect(doc).toMatch(/v\u00ea o seu IP|vê o seu IP/)
    expect(doc).toMatch(/AGF_RELEASES_BASE/)
    expect(doc).toMatch(/sem telemetria/i)
    expect(doc).toMatch(/nunca.*verifica atualiza/i)
  })

  it('documents the npm fallback (tier 2) for each OS', () => {
    const npmMentions = doc.match(/npm install -g/g) ?? []
    expect(npmMentions.length).toBeGreaterThanOrEqual(3)
  })

  it('flags the not-yet-shipped GUI installers as upcoming, not available', () => {
    expect(doc).toMatch(/em breve/i)
    expect(doc).toMatch(/AppImage/)
    expect(doc).toMatch(/\.pkg/)
  })

  it('ends onboarding with the zero-jargon welcome step (`agf` with no args)', () => {
    expect(doc).toMatch(/## Pronto — primeiro uso/)
    expect(doc).toMatch(/tela de boas-vindas/)
  })

  it('documents the Gatekeeper/SmartScreen bypass for anyone who bypasses the installer', () => {
    expect(doc).toMatch(/Gatekeeper|desenvolvedor não identificado/)
    expect(doc).toMatch(/SmartScreen/)
  })
})
