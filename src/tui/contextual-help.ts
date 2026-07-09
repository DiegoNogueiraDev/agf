import type { ViewName } from './tab-nav.js'

export interface ContextState {
  totalNodes: number
  view: ViewName
}

/** Returns a contextual help hint for the current view when the graph is empty, or null when nodes exist. */
export function getContextualHelp(state: ContextState): string | null {
  if (state.totalNodes > 0) return null

  switch (state.view) {
    case 'kanban':
      return 'Kanban vazio — use /import-prd para adicionar nodes'
    case 'tree':
      return 'Graph Tree vazia — use /wizard para começar'
    case 'health':
      return 'Projeto vazio — sem dados de saúde disponíveis'
    case 'economy':
      return 'Sem dados de economia — crie nodes no grafo'
    default:
      return 'Grafo vazio — use /wizard ou /import-prd'
  }
}
