/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * wire-check — the most expensive real pattern seen in production incidents
 * (ServiceNow, SFTP adapters): a client/service shipped with tests, but no
 * caller outside the test suite ever activated the real (non-mock) branch —
 * flipping USE_MOCK=false in production broke with no test having ever
 * caught it. Pure, injectable-file-set detector (mirrors detect-phantom-
 * done.ts's DIP shape): finds a mock-gated conditional in a target file,
 * then checks whether any OTHER, non-test file in the provided set actually
 * activates it.
 */

export interface SourceFile {
  path: string
  content: string
}

export interface UnwiredBranch {
  param: string
  line: number
}

const TEST_FILE_PATTERN = /\.test\.[tj]sx?$|\.spec\.[tj]sx?$|__tests__/

/** Mock-gated conditionals: `if (x === false)`, `if (x == false)`, `if (!x)` where x reads as a mock/adapter flag. */
const MOCK_EQ_FALSE_PATTERN = /if\s*\(\s*(\w*mock\w*)\s*={2,3}\s*false\s*\)/gi
const MOCK_NEGATION_PATTERN = /if\s*\(\s*!(\w*mock\w*)\s*\)/gi

function findMockGatedParams(content: string): Array<{ param: string; line: number }> {
  const found: Array<{ param: string; line: number }> = []
  for (const pattern of [MOCK_EQ_FALSE_PATTERN, MOCK_NEGATION_PATTERN]) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length
      found.push({ param: match[1], line })
    }
  }
  return found
}

/** Whether `content` calls/sets `param` to `false` — the value that activates the real (non-mock) branch. */
function activatesParam(content: string, param: string): boolean {
  const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const activationPattern = new RegExp(`\\b${escaped}\\s*[:=]\\s*false\\b|\\(\\s*false\\s*\\)`, 'i')
  return activationPattern.test(content)
}

/**
 * Find mock-gated branches in `target` that no non-test file in `allFiles`
 * actually activates — a real (non-mock) code path only ever exercised by
 * the test suite, never wired to a real caller.
 */
export function findUnwiredMockBranches(target: SourceFile, allFiles: SourceFile[]): UnwiredBranch[] {
  const gatedParams = findMockGatedParams(target.content)
  if (gatedParams.length === 0) return []

  const nonTestOtherFiles = allFiles.filter((f) => f.path !== target.path && !TEST_FILE_PATTERN.test(f.path))

  return gatedParams.filter(({ param }) => !nonTestOtherFiles.some((f) => activatesParam(f.content, param)))
}
