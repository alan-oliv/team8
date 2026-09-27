import type { TeamSummary } from '../shared/domain';

/**
 * The team a session drives, on direct evidence only: config.leadSessionId, or
 * the session a teammate sidecar ties the team to (`drivers`), matching the
 * session or any `/branch` ancestor in `chain`. Never the folder-based
 * adoption, which once handed a session a neighbour's finished team. A re-keyed
 * team and the lead-only directory it replaced can both match; the one with
 * teammates is the real one.
 */
export function teamOfSession(
  teams: readonly TeamSummary[],
  drivers: ReadonlyMap<string, string>,
  chain: readonly string[],
): TeamSummary | undefined {
  const ids = new Set(chain);
  return teams
    .filter((t) => ids.has(t.leadSessionId) || ids.has(drivers.get(t.name) ?? ''))
    .sort((a, b) => b.members - a.members)[0];
}

/**
 * What `auto` shows. Claude Code leaves team directories behind, so only a
 * live team counts; a lead-only roster is not a real team and is a fallback.
 */
export function autoTeam(teams: readonly TeamSummary[]): TeamSummary | undefined {
  const live = teams.filter((t) => t.live);
  const real = live.filter((t) => t.members >= 2);
  return [...(real.length > 0 ? real : live)].sort(
    (a, b) => Number(b.leadAlive) - Number(a.leadAlive) || b.createdAt - a.createdAt,
  )[0];
}
