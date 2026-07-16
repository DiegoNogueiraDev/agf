/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

export const RAW_CAP = 10 * 1024 * 1024
export const MIN_COMPRESS_SIZE = 500
export const DETECT_WINDOW = 1024
export const GIT_DIFF_HUNK_MAX_LINES = 100
export const GIT_DIFF_CONTEXT_KEEP = 3
export const DEDUP_LINE_MAX = 2000

export const GREP_PER_FILE_MAX = 10
export const FIND_PER_DIR_MAX = 10
export const FIND_TOTAL_DIR_MAX = 20

export const STATUS_MAX_FILES = 10
export const STATUS_MAX_UNTRACKED = 10

export const LS_EXT_SUMMARY_TOP = 5
export const LS_NOISE_DIRS = [
  'node_modules',
  '.git',
  'target',
  '__pycache__',
  '.next',
  'dist',
  'build',
  '.venv',
  'venv',
  '.cache',
  '.idea',
  '.vscode',
  '.DS_Store',
]

export const TREE_MAX_LINES = 200

export const SEARCH_LIST_PER_DIR_MAX = 10
export const SEARCH_LIST_TOTAL_DIR_MAX = 20

export const SMART_TRUNCATE_HEAD = 120
export const SMART_TRUNCATE_TAIL = 60
export const SMART_TRUNCATE_MIN_LINES = 250

export const READ_NUMBERED_MIN_HIT_RATIO = 0.7

export const TEST_RUNNER_MAX_KEEP = 400
export const LINT_REPORT_TOP_LOCATIONS = 3

export const FILTERS = {
  GIT_DIFF: 'git-diff',
  GIT_STATUS: 'git-status',
  GIT_LOG: 'git-log',
  GREP: 'grep',
  FIND: 'find',
  LS: 'ls',
  TREE: 'tree',
  DEDUP_LOG: 'dedup-log',
  SMART_TRUNCATE: 'smart-truncate',
  READ_NUMBERED: 'read-numbered',
  SEARCH_LIST: 'search-list',
  BUILD_OUTPUT: 'build-output',
  TEST_RUNNER: 'test-runner',
  LINT_REPORT: 'lint-report',
} as const
