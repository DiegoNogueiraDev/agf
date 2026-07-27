/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Canonical grade schema — single source of truth for A-F letter grades.
 */

import { z } from 'zod/v4'

export const GradeSchema = z.enum(['A', 'B', 'C', 'D', 'F'])
export type Grade = z.infer<typeof GradeSchema>
