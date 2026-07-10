/*!
 * app-server ping — round-trips a request through RemoteAppServerClient to prove
 * the app-server transport is reachable. First surface consumer of client.ts
 * (WIRE: node_wire_adb71a7dd8fd — dormant capability, no prior surface import).
 */

import { RemoteAppServerClient } from './client.js'

export interface PingResult {
  ok: boolean
  latencyMs: number
}

/** Connects to an app-server URL, sends a 'ping', and measures round-trip latency. */
export async function pingAppServer(url: string, timeoutMs = 5000): Promise<PingResult> {
  const client = new RemoteAppServerClient(url)
  const start = Date.now()
  try {
    await withTimeout(client.connect(), timeoutMs, 'app-server connect')
    await withTimeout(client.request('ping'), timeoutMs, 'app-server ping')
    return { ok: true, latencyMs: Date.now() - start }
  } finally {
    client.shutdown()
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}
