/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * detect-fixture-only — the most expensive real pattern seen this session:
 * a test goes green against a small hand-built fixture, and the bug only
 * appears when the code runs against the real corpus. For core modules
 * (parser/interpreter/compiler/anything under core/), a hand-built fixture
 * proves the happy path exists, not that the module survives real input.
 *
 * Pure — mirrors detect-phantom-done.ts's DIP shape: no filesystem access,
 * the gate (done-cmd.ts) reads file content and passes it in.
 */

// Session evidence (node_927af0ce2f93): the previous `(^|\/)core\//i`
// fallback matched almost every file in the codebase (all of src/core/),
// forcing --force on 10 legitimate pure-function/composition wires with
// zero actual corpus-scale parsers among them. Narrowed to the specific
// module kinds that genuinely need corpus-scale testing.
const CORE_MODULE_PATTERN = /\b(parser|interpreter|compiler|lexer|tokenizer)\b/i
const CORPUS_REFERENCE_PATTERN = /corpus\//i

function isCoreModulePath(path: string): boolean {
  return CORE_MODULE_PATTERN.test(path)
}

/**
 * True when a task touches a core module but none of its test files
 * reference the real corpus — only fixtures/constructed objects. Not
 * applicable (returns false) for non-core modules, or when there are no
 * test files at all (a different DoD concern: has_test_files).
 */
export function isFixtureOnlyDelivery(
  implementationFiles: readonly string[],
  testFileContents: readonly string[],
): boolean {
  const touchesCoreModule = implementationFiles.some(isCoreModulePath)
  if (!touchesCoreModule) return false
  if (testFileContents.length === 0) return false

  return !testFileContents.some((content) => CORPUS_REFERENCE_PATTERN.test(content))
}
