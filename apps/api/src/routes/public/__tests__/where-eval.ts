// Test helper: evaluates the category/subtype clauses of a Prisma `where` (null, contains, NOT,
// OR, AND) over a plain row with SQL semantics - NOT over a NULL column is NULL, i.e. not a
// match. The My Style adult/kids split depends on exactly that, so the doubles must not guess.
export type Cond = Record<string, unknown>;

export function evalCond(p: Record<string, unknown>, c: Cond): boolean | null {
  const parts: (boolean | null)[] = [];
  for (const [k, v] of Object.entries(c)) {
    if (k === 'AND') parts.push((v as Cond[]).every((x) => evalCond(p, x) === true));
    else if (k === 'OR') parts.push((v as Cond[]).some((x) => evalCond(p, x) === true));
    else if (k === 'NOT') {
      const inner = evalCond(p, v as Cond);
      parts.push(inner === null ? null : !inner);
    } else if (v === null) parts.push(p[k] === null);
    else {
      const col = p[k] as string | null;
      const needle = (v as { contains: string }).contains.toLowerCase();
      parts.push(col === null ? null : col.toLowerCase().includes(needle));
    }
  }
  return parts.includes(null) ? null : parts.every(Boolean);
}

/** True when every top-level `AND` clause matches the row. */
export const matchesAnd = (p: object, and: Cond[] | undefined) =>
  (and ?? []).every((c) => evalCond(p as Record<string, unknown>, c) === true);
