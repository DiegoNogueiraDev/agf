/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/credential-guard.ts — redactSecrets + checkDomainAllowed.
 */

import { describe, it, expect } from 'vitest'
import { redactSecrets, checkDomainAllowed } from '../plugins/browser/credential-guard.js'

describe('redactSecrets', () => {
  it('AC1: remove valores de credencial/cookie de logs/auditoria', () => {
    const log = 'login user=alice password=S3cr3tP@ss cookie=ABC123XYZ done'
    const out = redactSecrets(log, ['S3cr3tP@ss', 'ABC123XYZ'])
    expect(out).not.toContain('S3cr3tP@ss')
    expect(out).not.toContain('ABC123XYZ')
    expect(out).toContain('[REDACTED]')
    expect(out).toContain('user=alice') // não-segredo preservado
  })

  it('escapa metacaracteres de regex no segredo', () => {
    const out = redactSecrets('token=a.b*c(d)', ['a.b*c(d)'])
    expect(out).toBe('token=[REDACTED]')
  })

  it('ignora segredos vazios/curtos (<3) para não mascarar texto trivial', () => {
    expect(redactSecrets('ok', ['', 'a'])).toBe('ok')
  })
})

describe('checkDomainAllowed', () => {
  it('allowlist vazia → sem restrição', () => {
    expect(checkDomainAllowed('https://anything.com', [])).toEqual({ allowed: true })
  })

  it('host exato e subdomínio são permitidos', () => {
    expect(checkDomainAllowed('https://example.com/login', ['example.com']).allowed).toBe(true)
    expect(checkDomainAllowed('https://app.example.com/x', ['example.com']).allowed).toBe(true)
  })

  it('AC2: domínio fora da allowlist → domain_blocked', () => {
    const r = checkDomainAllowed('https://evil.com/phish', ['example.com'])
    expect(r.allowed).toBe(false)
    expect(r.code).toBe('domain_blocked')
  })

  it('URL inválida com allowlist ativa → bloqueada', () => {
    expect(checkDomainAllowed('not a url', ['example.com']).allowed).toBe(false)
  })
})
