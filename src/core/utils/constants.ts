/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Centralized constants for mcp-graph store directories.
 */

import path from 'node:path'
import os from 'node:os'

/** Current store directory name (visible, not hidden) */
export const STORE_DIR = 'workflow-graph'

/** Default database file name */
export const DB_FILE = 'graph.db'

/** Global store directory name (inside home dir) */
export const GLOBAL_STORE_DIR = '.mcp-graph'

/** Global store directory path (~/.mcp-graph/) */
export const GLOBAL_DB_DIR = path.join(os.homedir(), GLOBAL_STORE_DIR)

/** Global database file path (~/.mcp-graph/graph.db) */
export const GLOBAL_DB_PATH = path.join(GLOBAL_DB_DIR, DB_FILE)

/** Global memories directory (~/.mcp-graph/memories/) */
export const GLOBAL_MEMORIES_DIR = path.join(GLOBAL_DB_DIR, 'memories')

/** Global config file (~/.mcp-graph/config.json) */
export const GLOBAL_CONFIG_FILE = path.join(GLOBAL_DB_DIR, 'config.json')

// ── Bootstrap tools ──

/**
 * Tools that must ALWAYS bypass strict gates (code-intelligence, lifecycle).
 * These are bootstrap/configuration tools that should never be blocked.
 * Single source of truth — imported by tool-classification.ts and lifecycle-phase.ts.
 */
export const BOOTSTRAP_TOOLS = new Set(['init', 'set_phase', 'knowledge', 'sync_stack_docs'])

/**
 * Alias for BOOTSTRAP_TOOLS — tools always allowed regardless of mode.
 * Single source of truth for all tool classification.
 */
export const ALWAYS_ALLOWED_TOOLS = BOOTSTRAP_TOOLS

/**
 * Tools that perform read-only operations and should never be blocked
 * by code-intelligence or lifecycle gates.
 * Includes ALWAYS_ALLOWED_TOOLS as a subset.
 */
export const READ_ONLY_TOOLS = new Set([
  ...ALWAYS_ALLOWED_TOOLS,
  'list',
  'show',
  'search',
  'metrics',
  'export',
  'context',
  'knowledge',
  'analyze',
  'snapshot',
  'next',
  'list_memories',
  'read_memory',
  'manage_skill',
  'stats',
  'velocity',
  'dependencies',
  'plan_sprint',
  'validate',
  'code_intelligence',
  'journey',
  'query_graph',
  'help',
  'economy',
  // "hooks" is technically mutating (register/unregister/invoke) but skipping
  // it from tool:pre-call/post-call avoids recursion when a tool:* handler is
  // itself registered via the hooks tool, and hook state is in-memory only.
  'hooks',
])

// ── Node defaults ──

/** Default status for newly created nodes */
export const DEFAULT_NODE_STATUS = 'backlog' as const

/** Default priority for newly created nodes (1=critical, 5=optional) */
export const DEFAULT_NODE_PRIORITY = 3 as const

// ── Token budget defaults ──

/** Default token budget for context assembly and RAG queries */
export const DEFAULT_TOKEN_BUDGET = 4000

/** Default max tokens per chunk in text chunking */
export const DEFAULT_CHUNK_MAX_TOKENS = 500

/** Default overlap tokens between chunks */
export const DEFAULT_CHUNK_OVERLAP = 50

// ── Translation / UCR constants ──

/** All languages supported by the UCR (matches LSP server-registry) */
export const SUPPORTED_LANGUAGES = [
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'cpp',
  'ruby',
  'php',
  'kotlin',
  'swift',
  'csharp',
  'lua',
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** Language pairs available for translation */
export const SUPPORTED_LANGUAGE_PAIRS: ReadonlyArray<{ from: SupportedLanguage; to: SupportedLanguage }> = [
  { from: 'typescript', to: 'python' },
  { from: 'python', to: 'typescript' },
] as const

/** MVP language pairs (initially only TS <-> Python) */
export const MVP_LANGUAGE_PAIRS = SUPPORTED_LANGUAGE_PAIRS

/** Confidence threshold below which AI assistance is needed */
export const UCR_CONFIDENCE_THRESHOLD = 0.7

/** Check if a language is supported */
export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)
}

/** Check if a language pair is supported for translation */
export function isLanguagePairSupported(from: string, to: string): boolean {
  return SUPPORTED_LANGUAGE_PAIRS.some((p) => p.from === from && p.to === to)
}
