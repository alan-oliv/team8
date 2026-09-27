import { describe, it, expect } from 'vitest';
import type { TeamSummary } from '../shared/domain';
import { autoTeam, teamOfSession } from './watch';

function team(name: string, over: Partial<TeamSummary> = {}): TeamSummary {
  return {
    name,
    members: 2,
    createdAt: 0,
    leadSessionId: '',
    leadAlive: false,
    lastActivityAt: 0,
    live: false,
    current: false,
    state: 'done',
    ...over,
  };
}

describe('teamOfSession', () => {
  it('finds the team whose config names the session as its lead', () => {
    const mine = team('session-mine', { leadSessionId: 'S' });
    expect(teamOfSession([team('other', { leadSessionId: 'X' }), mine], new Map(), ['S'])).toBe(mine);
  });

  it('finds a re-keyed team through the teammate sidecar that names it', () => {
    const rekeyed = team('rekeyed', { leadSessionId: 'fresh-id-nobody-has' });
    expect(teamOfSession([rekeyed], new Map([['rekeyed', 'S']]), ['S'])).toBe(rekeyed);
  });

  it("finds a /branch'd session's team through its ancestor", () => {
    const parents = team('parents', { leadSessionId: 'PARENT' });
    expect(teamOfSession([parents], new Map(), ['CHILD', 'PARENT'])).toBe(parents);
  });

  it('prefers the re-keyed team over the lead-only directory it replaced', () => {
    const leadOnly = team('session-s', { leadSessionId: 'S', members: 1 });
    const rekeyed = team('rekeyed', { leadSessionId: 'fresh', members: 3 });
    expect(teamOfSession([leadOnly, rekeyed], new Map([['rekeyed', 'S']]), ['S'])).toBe(rekeyed);
  });

  it('finds nothing without direct evidence, even for a team in the same folder', () => {
    expect(teamOfSession([team('neighbour', { leadSessionId: 'N' })], new Map([['neighbour', 'N']]), ['S'])).toBeUndefined();
  });
});

describe('autoTeam', () => {
  it('picks a live team with teammates over a newer lead-only one', () => {
    const real = team('real', { live: true, members: 3, createdAt: 1 });
    expect(autoTeam([team('solo', { live: true, members: 1, createdAt: 2 }), real])).toBe(real);
  });

  it('prefers a team whose lead is running, then the newest', () => {
    const running = team('running', { live: true, leadAlive: true, createdAt: 1 });
    const newer = team('newer', { live: true, createdAt: 2 });
    const newest = team('newest', { live: true, createdAt: 3 });
    expect(autoTeam([newer, running, newest])).toBe(running);
    expect(autoTeam([newer, newest])).toBe(newest);
  });

  it('falls back to a live lead-only team, and to nothing when none is live', () => {
    const solo = team('solo', { live: true, members: 1 });
    expect(autoTeam([team('dead', { members: 7 }), solo])).toBe(solo);
    expect(autoTeam([team('dead', { members: 7 })])).toBeUndefined();
  });
});
