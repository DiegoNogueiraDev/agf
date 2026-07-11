export interface Transport {
  send(message: Record<string, unknown>): void
  onMessage(handler: (msg: Record<string, unknown>) => void): void
  close(): void
}

export function parseListenUrl(url: string): string | null {
  if (url.startsWith('stdio://')) return 'stdio'
  if (url.startsWith('ws://') || url.startsWith('wss://')) return 'ws'
  if (url.startsWith('unix://')) return 'unix'
  return null
}
