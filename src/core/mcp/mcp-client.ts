import crypto from 'node:crypto'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { platform } from 'node:os'
import { McpGraphError } from '../utils/errors.js'

export type BrowserSpawner = (cmd: string, args: string[]) => void

export interface OpenBrowserSafeOptions {
  platform?: string
  spawn?: BrowserSpawner
}

const defaultBrowserSpawner: BrowserSpawner = (cmd, args) => {
  execFileSync(cmd, args, { stdio: 'ignore', timeout: 10000 })
}

/**
 * Open a URL in the default browser using execFileSync (no shell interpolation).
 * Validates that the URL uses http or https to prevent protocol-based injection (CWE-78).
 */
export function openBrowserSafe(url: string, opts: OpenBrowserSafeOptions = {}): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
    // Reject URLs with shell-dangerous characters even as literal args to be safe
    if (/["'`$;&|<>\\]/.test(url)) return
  } catch {
    return
  }
  const plat = opts.platform ?? platform()
  const spawner = opts.spawn ?? defaultBrowserSpawner
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'start' : 'xdg-open'
  try {
    spawner(cmd, [url])
  } catch {
    /* best-effort */
  }
}

function openBrowser(url: string): void {
  openBrowserSafe(url)
}

export interface AuthMetadata {
  authorizationEndpoint: string
  tokenEndpoint: string
  scopesSupported?: string[]
}

export type ClientState = 'disconnected' | 'connecting' | 'connected' | 'needs_auth' | 'failed'

export interface McpAuthToken {
  accessToken: string
  tokenType: string
  expiresAt: number
  refreshToken?: string
}

export interface McpClientConfig {
  name: string
  url?: string
  command?: string
  args?: string[]
  clientId?: string
  scopes?: string[]
}

export type TransportType = 'streamable-http' | 'sse' | 'stdio'

function detectTransport(cfg: McpClientConfig): TransportType {
  if (cfg.command) return 'stdio'
  if (cfg.url) return 'streamable-http'
  return 'sse'
}

export class McpClient {
  readonly config: McpClientConfig
  readonly transportType: TransportType
  private state: ClientState = 'disconnected'
  private token: McpAuthToken | null = null
  private authState = ''
  private _toolCount = 0

  constructor(config: McpClientConfig) {
    this.config = config
    this.transportType = detectTransport(config)
  }

  getState(): ClientState {
    return this.state
  }

  get toolCount(): number {
    return this._toolCount
  }

  setToolCount(n: number): void {
    this._toolCount = n
  }

  getToken(): McpAuthToken | null {
    return this.token
  }

  setToken(token: McpAuthToken): void {
    this.token = token
    this.state = 'connected'
  }

  needsAuth(): boolean {
    if (!this.token) return true
    return Date.now() >= this.token.expiresAt
  }

  generateAuthUrl(): string {
    this.authState = crypto.randomBytes(16).toString('hex')
    const base = this.config.url || ''
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId || 'mcp-client',
      state: this.authState,
      redirect_uri: 'http://localhost:37463/callback',
    })
    if (this.config.scopes?.length) params.set('scope', this.config.scopes.join(' '))
    return `${base}/authorize?${params}`
  }

  verifyState(state: string): boolean {
    if (!this.authState || !state) return false
    return state === this.authState
  }

  getStateForAuth(): string {
    return this.authState
  }

  async discoverAuthMetadata(): Promise<AuthMetadata> {
    const base = this.config.url!.replace(/\/$/, '')
    const wellKnown = `${base}/.well-known/oauth-authorization-server`
    const resp = await fetch(wellKnown)
    if (!resp.ok) {
      return {
        authorizationEndpoint: `${base}/authorize`,
        tokenEndpoint: `${base}/token`,
      }
    }
    const data = (await resp.json()) as {
      authorization_endpoint?: string
      token_endpoint?: string
      scopes_supported?: string[]
    }
    return {
      authorizationEndpoint: data.authorization_endpoint ?? `${base}/authorize`,
      tokenEndpoint: data.token_endpoint ?? `${base}/token`,
      scopesSupported: data.scopes_supported,
    }
  }

  async startOAuthFlow(meta: AuthMetadata): Promise<void> {
    this.state = 'needs_auth'
    const redirectUri = 'http://localhost:37463/callback'
    const code = await this.startCallbackServer(redirectUri, meta)
    if (!code) throw new McpGraphError('OAuth flow cancelled by user')
    await this.exchangeCodeAt(meta.tokenEndpoint, code, redirectUri)
  }

  private startCallbackServer(redirectUri: string, meta: AuthMetadata): Promise<string> {
    const urlObj = new URL(redirectUri)
    let resolvePromise: (code: string) => void

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !this.verifyState(state ?? '')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('OAuth authorization failed')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Authorization complete. You may close this window.')
      server.close()
      resolvePromise(code)
    })

    return new Promise<string>((resolve, reject) => {
      resolvePromise = resolve
      server.listen(parseInt(urlObj.port, 10), () => {
        this.authState = crypto.randomBytes(16).toString('hex')
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: this.config.clientId || 'mcp-client',
          state: this.authState,
          redirect_uri: redirectUri,
        })
        if (this.config.scopes?.length) params.set('scope', this.config.scopes.join(' '))
        const authUrl = `${meta.authorizationEndpoint}?${params}`
        openBrowser(authUrl)
      })
      server.on('error', reject)
      setTimeout(() => {
        server.close()
        reject(new McpGraphError('OAuth timeout'))
      }, 120_000)
    })
  }

  private async exchangeCodeAt(endpoint: string, code: string, redirectUri: string): Promise<McpAuthToken> {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId || 'mcp-client',
        redirect_uri: redirectUri,
      }),
    })
    if (!resp.ok) {
      this.state = 'failed'
      throw new McpGraphError(`token exchange failed: ${resp.status}`)
    }
    const data = (await resp.json()) as {
      access_token: string
      token_type: string
      expires_in?: number
      refresh_token?: string
    }
    const token: McpAuthToken = {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      refreshToken: data.refresh_token,
    }
    this.token = token
    this.state = 'connected'
    return token
  }
}
