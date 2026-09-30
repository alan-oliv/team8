export interface Interval { startAt: number; endAt: number }

// The description is part of the match: "Wake Requests" and "Assertions" lines
// share the date prefix but are not sleeps or wakes. A dark wake counts as awake:
// agents run during those maintenance wakes.
const EVENT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) (?:Sleep\s+Entering Sleep|(?:Dark)?Wake\s+(?:Dark)?Wake from)/;

export function parsePmsetLog(text: string): Interval[] {
  const out: Interval[] = [];
  let asleepAt: number | undefined;
  for (const line of text.split('\n')) {
    const m = EVENT.exec(line);
    if (!m) continue;
    const at = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
    if (line.includes('Entering Sleep')) asleepAt ??= at;
    else if (asleepAt !== undefined) {
      out.push({ startAt: asleepAt, endAt: at });
      asleepAt = undefined;
    }
  }
  return out;
}
