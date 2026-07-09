/**
 * MCP Tool Catalog — pure tool schema definitions.
 * Zero business logic — these are just the MCP contract.
 * Exported as a separate module so it can be reused by other transports.
 */

export const TOOLS = [
  {
    name: 'add_node',
    description:
      'Add a node (epic, task, subtask, requirement, constraint, risk, decision, acceptance_criteria) to the execution graph',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string' as const,
          enum: ['epic', 'task', 'subtask', 'requirement', 'constraint', 'risk', 'decision', 'acceptance_criteria'],
        },
        title: { type: 'string' as const, description: 'Node title' },
        description: { type: 'string' as const, description: 'Node description' },
        parentId: { type: 'string' as const, description: 'Parent node ID' },
        priority: { type: 'number' as const, enum: [1, 2, 3, 4, 5], description: '1=highest, 5=lowest' },
        acceptanceCriteria: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Acceptance criteria list',
        },
        tags: { type: 'array' as const, items: { type: 'string' as const }, description: 'Tags' },
        xpSize: { type: 'string' as const, enum: ['XS', 'S', 'M', 'L', 'XL'], description: 'Size estimate' },
      },
      required: ['type', 'title'],
    },
  },
  {
    name: 'update_status',
    description: "Update a node's status (backlog, in_progress, done, blocked)",
    inputSchema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string' as const, description: 'Node ID to update' },
        status: { type: 'string' as const, enum: ['backlog', 'in_progress', 'done', 'blocked'] },
      },
      required: ['nodeId', 'status'],
    },
  },
  {
    name: 'start_task',
    description:
      'Find next task + context + update_status(in_progress). Returns task id, title, AC, and context summary.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string' as const, description: 'Specific task ID to start (optional; finds next if omitted)' },
      },
    },
  },
  {
    name: 'finish_task',
    description: 'Finish a task: check DoD criteria + update_status(done). Returns DoD report.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string' as const, description: 'Task ID to finish' },
        rationale: { type: 'string' as const, description: 'What was implemented, key decisions' },
        testFiles: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Test files created/modified',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'analyze',
    description: 'Run analysis on the graph. Mode: stats, status, blockers, structure.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mode: {
          type: 'string' as const,
          enum: ['stats', 'status', 'blockers', 'structure', 'full'],
          description: 'Analysis mode',
        },
        nodeId: { type: 'string' as const, description: 'Optional: scope to specific node' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'context',
    description: 'Load graph context: graph summary, node details, or child nodes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string' as const,
          enum: ['summary', 'node', 'children', 'backlog'],
          description: 'What context to load',
        },
        nodeId: { type: 'string' as const, description: 'Node ID for node/children actions' },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_nodes',
    description: 'List nodes filtered by type, status, or parent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string' as const, description: 'Filter by node type' },
        status: { type: 'string' as const, description: 'Filter by status' },
        parentId: { type: 'string' as const, description: 'Filter by parent node' },
      },
    },
  },
  {
    name: 'get_node',
    description: 'Get a single node by ID with full details',
    inputSchema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string' as const, description: 'Node ID' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'update_node',
    description: 'Update node fields (title, description, priority, acceptanceCriteria, tags, xpSize, parentId)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string' as const },
        title: { type: 'string' as const },
        description: { type: 'string' as const },
        priority: { type: 'number' as const, enum: [1, 2, 3, 4, 5] },
        acceptanceCriteria: { type: 'array' as const, items: { type: 'string' as const } },
        tags: { type: 'array' as const, items: { type: 'string' as const } },
        xpSize: { type: 'string' as const, enum: ['XS', 'S', 'M', 'L', 'XL'] },
        parentId: { type: 'string' as const },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'snapshot',
    description: 'Get a snapshot of the current graph state (counts by type and status)',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'code_intelligence.definition',
    description: 'Go to definition of a symbol at a given file position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: { type: 'string' as const },
        line: { type: 'number' as const },
        character: { type: 'number' as const },
      },
      required: ['file', 'line', 'character'],
    },
  },
  {
    name: 'code_intelligence.references',
    description: 'Find all references to a symbol at a given file position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: { type: 'string' as const },
        line: { type: 'number' as const },
        character: { type: 'number' as const },
      },
      required: ['file', 'line', 'character'],
    },
  },
  {
    name: 'code_intelligence.hover',
    description: 'Get hover information for a symbol at a given file position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: { type: 'string' as const },
        line: { type: 'number' as const },
        character: { type: 'number' as const },
      },
      required: ['file', 'line', 'character'],
    },
  },
  {
    name: 'code_intelligence.document_symbols',
    description: 'Get all symbols defined in a file as a structured tree',
    inputSchema: {
      type: 'object' as const,
      properties: { file: { type: 'string' as const } },
      required: ['file'],
    },
  },
  {
    name: 'code_intelligence.workspace_symbols',
    description: 'Search for symbols across the entire workspace by query',
    inputSchema: {
      type: 'object' as const,
      properties: { query: { type: 'string' as const } },
      required: ['query'],
    },
  },
  {
    name: 'code_intelligence.diagnostics',
    description: 'Get LSP diagnostics for a file',
    inputSchema: {
      type: 'object' as const,
      properties: { file: { type: 'string' as const } },
      required: ['file'],
    },
  },
  {
    name: 'code_intelligence.languages',
    description: 'List all active LSP language servers and their status',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'code_intelligence.format_document',
    description: 'Format a complete document using LSP',
    inputSchema: {
      type: 'object' as const,
      properties: { file: { type: 'string' as const } },
      required: ['file'],
    },
  },
  {
    name: 'code_intelligence.code_actions',
    description: 'Get available code actions at a given file position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: { type: 'string' as const },
        line: { type: 'number' as const },
        character: { type: 'number' as const },
      },
      required: ['file', 'line', 'character'],
    },
  },
]
