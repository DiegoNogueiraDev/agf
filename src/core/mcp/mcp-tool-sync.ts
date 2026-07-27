export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type ToolSyncListener = (tools: McpToolDefinition[]) => void

export class McpToolRegistry {
  private tools: McpToolDefinition[] = []
  private listeners: ToolSyncListener[] = []

  get all(): McpToolDefinition[] {
    return [...this.tools]
  }

  get count(): number {
    return this.tools.length
  }

  setFromServer(tools: McpToolDefinition[]): void {
    this.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: this.sanitizeSchema(t.inputSchema),
    }))
    for (const listener of this.listeners) {
      listener(this.tools)
    }
  }

  onChanged(listener: ToolSyncListener): void {
    this.listeners.push(listener)
    if (this.tools.length > 0) listener(this.tools)
  }

  private sanitizeSchema(schema?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!schema) return undefined
    try {
      JSON.parse(JSON.stringify(schema))
      return schema
    } catch {
      return { type: 'object', description: 'schema unavailable' }
    }
  }
}
