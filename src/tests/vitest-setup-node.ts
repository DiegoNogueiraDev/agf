/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Global setup for the `node` vitest project. Tests routinely open a store
 * in a bare mkdtempSync tmpdir with no package.json/.git — that is exactly
 * the legitimate anchor-less case open-store.ts's --dir double-anchor guard
 * (node_78929e373432) is designed to allow via AGF_ALLOW_NO_ANCHOR, not a
 * real cross-project write risk.
 */
process.env.AGF_ALLOW_NO_ANCHOR = '1'

// The test runner itself runs under Claude Code (CLAUDECODE set), which would auto-activate
// the loss-safe economy bundle (task-prep node_7ee81fd6a5e0) and make every "levers default-off"
// baseline non-deterministic. Pin the escape hatch OFF globally so lever-toggle contracts are
// stable; the tests that specifically exercise auto-activation opt back in by clearing this.
process.env.AGF_ECONOMY_AUTO = '0'
