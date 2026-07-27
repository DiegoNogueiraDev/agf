export const ErrorKind = {
  Filesystem: 'filesystem',
  Auth: 'auth',
  Session: 'session',
  Parse: 'parse',
  Runtime: 'runtime',
  Mcp: 'mcp',
  Delivery: 'delivery',
  Usage: 'usage',
  Policy: 'policy',
  RateLimit: 'rate_limit',
  Validation: 'validation',
  Database: 'database',
  Network: 'network',
  Unknown: 'unknown',
} as const

export type ErrorKind = (typeof ErrorKind)[keyof typeof ErrorKind]

export interface ErrorEnvelope {
  kind: ErrorKind
  operation: string
  target: string
  hint?: string
  retryable: boolean
}

export type EnvelopeInput = ErrorEnvelope

export function createEnvelope(input: EnvelopeInput): ErrorEnvelope {
  return { ...input }
}

export function isGraphError(error: unknown): error is Error {
  return error instanceof Error && error.name.endsWith('Error') && 'context' in error
}
