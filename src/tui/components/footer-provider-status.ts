/*!
 * footer-provider-status — pure formatter for provider dot indicator in FooterBar.
 *
 * WHY: ambient connection awareness. Separates formatting logic from React rendering
 * so it can be unit-tested without Ink or JSX. FooterBar imports this and renders
 * the returned values via <Text color={result.color}>.
 *
 * Contract: formatProviderStatus({ providerId, reachable }) → { dot, color, label }.
 */

export interface ProviderStatusInput {
  providerId: string | undefined
  reachable: boolean
}

export interface ProviderStatusOutput {
  dot: string
  color: string
  label: string
}

/** Format provider reachability into a dot indicator for FooterBar. */
export function formatProviderStatus(input: ProviderStatusInput): ProviderStatusOutput {
  const { providerId, reachable } = input

  if (!providerId) {
    return { dot: '○', color: 'gray', label: 'no provider' }
  }

  return {
    dot: '●',
    color: reachable ? 'green' : 'red',
    label: providerId,
  }
}
