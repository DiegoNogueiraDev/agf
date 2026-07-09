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
