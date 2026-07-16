/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Autenticação do GitHub Copilot via HTTP direto (M1u) — OAuth device-flow +
 * troca por token Copilot, SEM depender do binário `copilot` CLI. Técnica do
 * provider do opencode (MIT): client_id público do Copilot, exchange em
 * `api.github.com/copilot_internal/v2/token` (JWT ~30min com refresh). Zero-dep
 * (fetch nativo); `FetchLike` injetável p/ testes.
 *
 * Token persistido em `~/.config/agent-graph-flow/auth.json` (0600).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'copilot-auth.ts' })

const authDataSchema = z.object({
  githubToken: z.string(),
  copilotToken: z.string().optional(),
  copilotExpiresAt: z.number().optional(),
  apiBase: z.string().optional(),
})

/** OAuth App ID público do GitHub Copilot (padrão usado por aider/opencode). */
const CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const USER_AGENT = 'GitHubCopilotChat/0.35.0'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const TOKEN_EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token'
/** Folga p/ refresh proativo: renova quando faltam <60s. */
const REFRESH_BUFFER_MS = 60_000

export class CopilotAuthError extends McpGraphError {
  constructor(message: string) {
    super(`Copilot auth error: ${message}`)
    this.name = 'CopilotAuthError'
  }
}

export interface FetchResponse {
  ok: boolean
  status: number
  /** Cabeçalhos da resposta (estilo `Headers`); usado p/ ler `retry-after`. */
  headers?: { get(name: string): string | null }
  json(): Promise<unknown>
  text(): Promise<string>
}
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponse>

export interface AuthData {
  /** Token OAuth do GitHub (ghu_… longo) ou PAT. */
  githubToken: string
  /** Token Copilot (JWT curto). */
  copilotToken?: string
  /** Expiração do token Copilot (ms epoch). */
  copilotExpiresAt?: number
  /** Base da API Copilot (de endpoints.api). */
  apiBase?: string
}

/** Caminho padrão do auth.json (respeita XDG_CONFIG_HOME). */
export function defaultAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0 ? env.XDG_CONFIG_HOME : join(homedir(), '.config')
  return join(base, 'agent-graph-flow', 'auth.json')
}

/** Load Copilot auth data from a JSON file; returns null when the file is absent or malformed. */
export function loadAuth(path: string): AuthData | null {
  if (!existsSync(path)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const result = authDataSchema.safeParse(raw)
    if (!result.success) {
      log.warn('copilot-auth: invalid shape in auth.json', { path, errors: result.error.flatten() })
      return null
    }
    return result.data
  } catch (err) {
    log.warn('copilot-auth: failed to parse auth.json', { path, error: String(err) })
    return null
  }
}

/** Persist Copilot auth data to a JSON file with mode 0o600 (owner-read-only). */
export function saveAuth(path: string, data: AuthData): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
}

const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

/** Passo 1: solicita o device code (mostre userCode+verificationUri ao usuário). */
export async function requestDeviceCode(fetchFn: FetchLike): Promise<DeviceCode> {
  const res = await fetchFn(DEVICE_CODE_URL, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ client_id: CLIENT_ID, scope: 'read:user' }),
  })
  if (!res.ok) throw new CopilotAuthError(`device code falhou (${res.status})`)
  const b = (await res.json()) as Record<string, unknown>
  return {
    deviceCode: String(b.device_code ?? ''),
    userCode: String(b.user_code ?? ''),
    verificationUri: String(b.verification_uri ?? ''),
    expiresIn: Number(b.expires_in ?? 900),
    interval: Number(b.interval ?? 5),
  }
}

export type PollResult = { accessToken: string } | { pending: true } | { slowDown: true }

/** Passo 2: faz UMA tentativa de troca do device code pelo access token. */
export async function pollForAccessToken(fetchFn: FetchLike, deviceCode: string): Promise<PollResult> {
  const res = await fetchFn(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  const b = (await res.json()) as Record<string, unknown>
  if (typeof b.access_token === 'string') return { accessToken: b.access_token }
  if (b.error === 'slow_down') return { slowDown: true }
  if (b.error === 'authorization_pending') return { pending: true }
  throw new CopilotAuthError(`device flow: ${String(b.error ?? 'erro desconhecido')}`)
}

export interface CopilotToken {
  token: string
  /** ms epoch. */
  expiresAt: number
  apiBase: string
}

/** Passo 3: troca o token do GitHub por um token Copilot de curta duração. */
export async function exchangeForCopilotToken(fetchFn: FetchLike, githubToken: string): Promise<CopilotToken> {
  const res = await fetchFn(TOKEN_EXCHANGE_URL, {
    method: 'GET',
    headers: {
      Authorization: `token ${githubToken}`,
      'User-Agent': USER_AGENT,
      'Editor-Version': 'vscode/1.85.1',
      'Editor-Plugin-Version': 'copilot/1.155.0',
      'Copilot-Integration-Id': 'vscode-chat',
    },
  })
  if (!res.ok) throw new CopilotAuthError(`token exchange falhou (${res.status}) — login expirado?`)
  const b = (await res.json()) as Record<string, unknown>
  const rawExp = Number(b.expires_at ?? 0)
  // expires_at pode vir em segundos; normaliza p/ ms.
  const expiresAt = rawExp < 1_000_000_000_000 ? rawExp * 1000 : rawExp
  const endpoints = (b.endpoints ?? {}) as Record<string, unknown>
  return {
    token: String(b.token ?? ''),
    expiresAt,
    apiBase: String(endpoints.api ?? 'https://api.githubcopilot.com'),
  }
}

export interface ValidTokenDeps {
  fetchFn?: FetchLike
  authFilePath?: string
  now?: () => number
}

/**
 * Devolve um token Copilot válido: usa o cache se ainda fresco, senão re-troca
 * pelo token do GitHub e atualiza o cache. Lança se não há login.
 */
export async function getValidCopilotToken(deps: ValidTokenDeps = {}): Promise<{ token: string; apiBase: string }> {
  const fetchFn = deps.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  const path = deps.authFilePath ?? defaultAuthPath()
  const now = (deps.now ?? Date.now)()

  const auth = loadAuth(path)
  if (!auth?.githubToken) {
    throw new CopilotAuthError('não autenticado — rode `agf login` primeiro.')
  }
  if (auth.copilotToken && auth.copilotExpiresAt && auth.copilotExpiresAt > now + REFRESH_BUFFER_MS) {
    return { token: auth.copilotToken, apiBase: auth.apiBase ?? 'https://api.githubcopilot.com' }
  }
  const fresh = await exchangeForCopilotToken(fetchFn, auth.githubToken)
  saveAuth(path, { ...auth, copilotToken: fresh.token, copilotExpiresAt: fresh.expiresAt, apiBase: fresh.apiBase })
  return { token: fresh.token, apiBase: fresh.apiBase }
}

/** True se há um login utilizável (token do GitHub salvo). */
export function isLoggedIn(authFilePath: string = defaultAuthPath()): boolean {
  return Boolean(loadAuth(authFilePath)?.githubToken)
}
