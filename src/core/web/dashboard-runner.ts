/*!
 * dashboard-runner — pure logic for `agf dashboard` (testable, no I/O).
 *
 * WHY: Extracted from the CLI action so startProgressServer and openBrowser
 * are injected and testable without a real HTTP server.
 *
 * Composes with: dashboard-cmd.ts (CLI wiring), progress-server.ts, open-browser.ts.
 */

export interface DashboardRunnerDeps {
  port: number
  noOpen: boolean
  startServer: (port: number) => Promise<string>
  openInBrowser: (url: string) => void
}

export type DashboardResult = { ok: true; data: { url: string; port: number } } | { ok: false; error: string }

export async function runDashboardCommand(deps: DashboardRunnerDeps): Promise<DashboardResult> {
  try {
    const url = await deps.startServer(deps.port)
    if (!deps.noOpen) deps.openInBrowser(url)
    return { ok: true, data: { url, port: deps.port } }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
