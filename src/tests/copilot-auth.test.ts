import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  requestDeviceCode,
  pollForAccessToken,
  exchangeForCopilotToken,
  getValidCopilotToken,
  loadAuth,
  saveAuth,
  type FetchLike,
  type FetchResponse,
} from '../core/model-hub/copilot-auth.js'

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('copilot-auth — device flow + token exchange (M1u)', () => {
  let dir: string
  let authFile: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-auth-'))
    authFile = join(dir, 'auth.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('requestDeviceCode parseia user_code/verification_uri/interval', async () => {
    const fetchFn: FetchLike = async () =>
      jsonResponse({
        device_code: 'dc',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      })
    const r = await requestDeviceCode(fetchFn)
    expect(r.deviceCode).toBe('dc')
    expect(r.userCode).toBe('ABCD-1234')
    expect(r.verificationUri).toContain('github.com/login/device')
    expect(r.interval).toBe(5)
  })

  it('pollForAccessToken devolve pending e depois o accessToken', async () => {
    const pending: FetchLike = async () => jsonResponse({ error: 'authorization_pending' })
    expect(await pollForAccessToken(pending, 'dc')).toEqual({ pending: true })

    const ok: FetchLike = async () => jsonResponse({ access_token: 'ghu_xxx', token_type: 'bearer' })
    expect(await pollForAccessToken(ok, 'dc')).toEqual({ accessToken: 'ghu_xxx' })
  })

  it('exchangeForCopilotToken parseia token/expiresAt/apiBase', async () => {
    const fetchFn: FetchLike = async () =>
      jsonResponse({ token: 'cop_jwt', expires_at: 1700000000, endpoints: { api: 'https://api.githubcopilot.com' } })
    const r = await exchangeForCopilotToken(fetchFn, 'ghu_xxx')
    expect(r.token).toBe('cop_jwt')
    expect(r.apiBase).toBe('https://api.githubcopilot.com')
    // expires_at em segundos é normalizado p/ ms
    expect(r.expiresAt).toBeGreaterThan(1_000_000_000_000)
  })

  it('saveAuth/loadAuth roundtrip e arquivo é 0600', () => {
    saveAuth(authFile, { githubToken: 'ghu_xxx' })
    expect(existsSync(authFile)).toBe(true)
    const mode = statSync(authFile).mode & 0o777
    expect(mode).toBe(0o600)
    expect(loadAuth(authFile)?.githubToken).toBe('ghu_xxx')
    // não vaza o conteúdo em texto inesperado
    expect(readFileSync(authFile, 'utf8')).toContain('ghu_xxx')
  })

  it('getValidCopilotToken usa o cache quando o token ainda é válido (sem re-exchange)', async () => {
    const future = Date.now() + 20 * 60_000
    saveAuth(authFile, {
      githubToken: 'ghu_xxx',
      copilotToken: 'cached_jwt',
      copilotExpiresAt: future,
      apiBase: 'https://api.githubcopilot.com',
    })
    let calls = 0
    const fetchFn: FetchLike = async () => {
      calls++
      return jsonResponse({ token: 'NEW', expires_at: future, endpoints: { api: 'x' } })
    }
    const r = await getValidCopilotToken({ fetchFn, authFilePath: authFile })
    expect(r.token).toBe('cached_jwt')
    expect(calls).toBe(0)
  })

  it('getValidCopilotToken re-exchange quando expirado e atualiza o cache', async () => {
    saveAuth(authFile, { githubToken: 'ghu_xxx', copilotToken: 'old', copilotExpiresAt: Date.now() - 1000 })
    const fetchFn: FetchLike = async () =>
      jsonResponse({
        token: 'fresh_jwt',
        expires_at: Date.now() + 1_800_000,
        endpoints: { api: 'https://api.githubcopilot.com' },
      })
    const r = await getValidCopilotToken({ fetchFn, authFilePath: authFile })
    expect(r.token).toBe('fresh_jwt')
    expect(loadAuth(authFile)?.copilotToken).toBe('fresh_jwt')
  })

  it('getValidCopilotToken lança quando não há login (sem githubToken)', async () => {
    const fetchFn: FetchLike = async () => jsonResponse({})
    await expect(getValidCopilotToken({ fetchFn, authFilePath: authFile })).rejects.toThrow()
  })
})
