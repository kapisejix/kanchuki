import { z } from 'zod';

// z.coerce.boolean() is Boolean(str), so the query string "false" parses as true (RC-127).
// Query-string flags go through this instead.
export const queryBool = () =>
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional();
