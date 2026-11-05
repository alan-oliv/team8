import { randomUUID } from 'node:crypto';

export interface OutboxMessage {
  id: string;
  session: string;
  text: string;
  ts: number;
}

/**
 * The operator's messages to a lead, on their way to its terminal. In memory,
 * like held permits: the plugin's module inside the lead's session polls
 * them, submits each as the person's own prompt, and acks it.
 */
export interface Outbox {
  /** Queues a message for the lead of `session`. */
  send(session: string, text: string, now?: number): { msgId: string };
  /** The undelivered messages for `session`, oldest first; records the poll as a heartbeat. */
  take(session: string, now?: number): OutboxMessage[];
  /** Drops one delivered message. False when the id is unknown. */
  ack(id: string): boolean;
  /** Polled within HEARTBEAT_MS: a live lead to type to. */
  reachable(session: string, now?: number): boolean;
}

/** The module polls every 2 s; this leaves room for a busy host. */
export const HEARTBEAT_MS = 15_000;
/** Queued for a session silent this long: nobody will ack it, so the next take or send drops it. */
export const DROP_AFTER_MS = 60_000;

export function createOutbox(): Outbox {
  const queued = new Map<string, OutboxMessage[]>();
  const polledAt = new Map<string, number>();

  const prune = (session: string, now: number): void => {
    const last = polledAt.get(session);
    if (last !== undefined && now - last >= DROP_AFTER_MS) queued.delete(session);
  };

  return {
    send(session, text, now = Date.now()) {
      prune(session, now);
      const msg = { id: randomUUID(), session, text, ts: now };
      queued.set(session, [...(queued.get(session) ?? []), msg]);
      return { msgId: msg.id };
    },

    take(session, now = Date.now()) {
      prune(session, now);
      polledAt.set(session, now);
      return [...(queued.get(session) ?? [])];
    },

    ack(id) {
      for (const [session, list] of queued) {
        const rest = list.filter((m) => m.id !== id);
        if (rest.length === list.length) continue;
        if (rest.length === 0) queued.delete(session);
        else queued.set(session, rest);
        return true;
      }
      return false;
    },

    reachable(session, now = Date.now()) {
      const last = polledAt.get(session);
      return last !== undefined && now - last < HEARTBEAT_MS;
    },
  };
}
