/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const OpenFolderBodySchema = z.object({
  path: z.string().min(1, 'Path is required').max(2000),
})

export type OpenFolderBody = z.infer<typeof OpenFolderBodySchema>
