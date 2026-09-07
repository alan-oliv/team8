/**
 * What a workflow's own `return` can be: free text, or — common for a
 * claim-verification pipeline like a deep-research run — a structured object
 * a script handed back directly rather than flattening to prose. `resultText`
 * (server/workflow.ts) already JSON-stringifies anything non-string, so this
 * is the inverse: read that string back into something a view can lay out as
 * sections instead of one dense line.
 */
export type Primitive = string | number | boolean;

export type OutputDoc =
  | { kind: 'prose'; text: string }
  | { kind: 'sections'; value: Record<string, unknown>; statsKey?: string }
  | { kind: 'json'; value: unknown };

function isFlatPrimitiveObject(v: unknown): v is Record<string, Primitive> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const values = Object.values(v as Record<string, unknown>);
  return values.length > 0 && values.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean');
}

export function parseOutput(result: string): OutputDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return { kind: 'prose', text: result };
  }
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const value = parsed as Record<string, unknown>;
    // A `stats` field (any case) that's a flat bag of numbers/strings reads
    // as a KPI row, not another vertical section — a script's own summary
    // counters belong at a glance, not scrolled past.
    const statsKey = Object.keys(value).find((k) => k.toLowerCase() === 'stats' && isFlatPrimitiveObject(value[k]));
    return { kind: 'sections', value, ...(statsKey !== undefined ? { statsKey } : {}) };
  }
  // Valid JSON, but nothing with keys to hang a section on — an array or a
  // bare primitive. Beautified rather than dropped back to one dense line.
  return { kind: 'json', value: parsed };
}

/** `sourceUrl` / `source_url` → `SOURCE URL` — a section head from a JS key, nothing fancier. */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toUpperCase();
}
