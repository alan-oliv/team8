import { describe, expect, it } from 'vitest';
import { DROP_AFTER_MS, HEARTBEAT_MS, createOutbox } from './outbox';

const S = 'aaaaaaaa-1111-2222-3333-444444444444';

describe('createOutbox', () => {
  it('is unreachable until polled, then reachable for HEARTBEAT_MS', () => {
    const outbox = createOutbox();
    expect(outbox.reachable(S, 1000)).toBe(false);
    outbox.take(S, 1000);
    expect(outbox.reachable(S, 1000 + HEARTBEAT_MS - 1)).toBe(true);
    expect(outbox.reachable(S, 1000 + HEARTBEAT_MS)).toBe(false);
  });

  it('serves queued messages oldest first until each is acked', () => {
    const outbox = createOutbox();
    const a = outbox.send(S, 'first', 1000);
    const b = outbox.send(S, 'second', 1001);
    expect(outbox.take(S, 1002).map((m) => [m.id, m.text])).toEqual([
      [a.msgId, 'first'],
      [b.msgId, 'second'],
    ]);
    // Not consumed by a take: only the ack retires a message.
    expect(outbox.take(S, 1003).map((m) => m.text)).toEqual(['first', 'second']);
    expect(outbox.ack(a.msgId)).toBe(true);
    expect(outbox.take(S, 1004).map((m) => m.text)).toEqual(['second']);
    expect(outbox.ack(a.msgId)).toBe(false);
  });

  it('keeps sessions apart', () => {
    const outbox = createOutbox();
    outbox.send(S, 'mine', 1000);
    expect(outbox.take('other', 1000)).toEqual([]);
    expect(outbox.take(S, 1000)).toHaveLength(1);
  });

  it('drops what a session that stopped polling never acked', () => {
    const outbox = createOutbox();
    outbox.take(S, 1000);
    outbox.send(S, 'late', 2000);
    expect(outbox.take(S, 1000 + DROP_AFTER_MS - 1)).toHaveLength(1);
    // That take refreshed the heartbeat; a full window of silence after it drops the queue.
    expect(outbox.take(S, 1000 + DROP_AFTER_MS - 1 + DROP_AFTER_MS)).toEqual([]);
  });
});
