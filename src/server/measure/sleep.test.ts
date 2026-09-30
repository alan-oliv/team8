import { describe, expect, it } from 'vitest';
import { parsePmsetLog } from './sleep';

const LOG = [
  '2026-09-29 04:50:16 -0300 Assertions          \tPID 91634(caffeinate) ClientDied PreventUserIdleSystemSleep "caffeinate command-line tool" 00:03:59',
  "2026-09-29 04:56:59 -0300 Sleep               \tEntering Sleep state due to 'Clamshell Sleep':TCPKeepAlive=active Using Batt (Charge:89%) 990 secs",
  '2026-09-29 05:13:16 -0300 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to SMC.OutboxNotEmpty/ Using Batt (Charge:89%) 16 secs',
  '2026-09-29 05:13:20 -0300 Wake Requests       \t[*process=mDNSResponder request=Maintenance deltaSecs=7199]',
  "2026-09-29 05:13:32 -0300 Sleep               \tEntering Sleep state due to 'Sleep Service Back to Sleep':TCPKeepAlive=active Using Batt (Charge:89%) 1 secs",
  '2026-09-29 11:03:59 -0300 Wake                \tWake from Deep Idle [CDNVA] : due to UserActivity Clamshell/ Using BATT (Charge:88%)',
].join('\n');

describe('parsePmsetLog', () => {
  it('pairs each sleep with the next wake or dark wake and skips every other line', () => {
    expect(parsePmsetLog(LOG)).toEqual([
      { startAt: Date.parse('2026-09-29T04:56:59-03:00'), endAt: Date.parse('2026-09-29T05:13:16-03:00') },
      { startAt: Date.parse('2026-09-29T05:13:32-03:00'), endAt: Date.parse('2026-09-29T11:03:59-03:00') },
    ]);
  });

  it('returns nothing for a log without sleeps', () => {
    expect(parsePmsetLog('')).toEqual([]);
  });
});
