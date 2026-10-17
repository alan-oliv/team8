// Task 15 appends createPermits to this file. Task 14 only needs the port
// type: hooks.ts holds a PermissionRequest against it and awaits the decision.
import { randomUUID } from 'node:crypto';

export interface HeldPermit {
  id: string;
  agent: string;
  toolName: string;
  input: unknown;
  expiresAt: number;
}

/**
 * `withdrawn` is the call going away on its own — interrupted, answered in the
 * terminal, or its session ended — so the hook answers with no decision.
 */
export interface PermitOutcome {
  decision: 'allow' | 'deny' | 'withdrawn';
  reason?: string;
  updatedInput?: Record<string, unknown>;
}

export interface Permits {
  hold(
    agent: string,
    toolName: string,
    input: unknown,
    timeoutMs: number,
  ): {
    id: string;
    promise: Promise<PermitOutcome>;
  };
  resolve(
    id: string,
    decision: 'allow' | 'deny',
    reason?: string,
    updatedInput?: Record<string, unknown>,
  ): boolean;
  withdraw(id: string): boolean;
  list(): HeldPermit[];
}

/**
 * Auto-deny short of the hook's own timeout so the agent gets a clear refusal
 * instead of the turn hanging to the full 600s. The card's countdown has to
 * agree with the timer, so both come from here.
 */
const AUTO_DENY_FACTOR = 0.9;

export function holdMsFor(timeoutMs: number): number {
  return Math.floor(timeoutMs * AUTO_DENY_FACTOR);
}

export function autoDenyReason(timeoutMs: number): string {
  return `auto-denied after ${holdMsFor(timeoutMs)}ms with no operator response`;
}

interface Entry {
  permit: HeldPermit;
  timer: NodeJS.Timeout;
  settle(outcome: PermitOutcome): void;
}

export function createPermits(): Permits {
  const held = new Map<string, Entry>();

  const take = (id: string): Entry | undefined => {
    const entry = held.get(id);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    held.delete(id);
    return entry;
  };

  return {
    hold(agent, toolName, input, timeoutMs) {
      const id = randomUUID();
      const holdMs = holdMsFor(timeoutMs);
      let settle!: (v: PermitOutcome) => void;
      const promise = new Promise<PermitOutcome>((res) => {
        settle = res;
      });

      const timer = setTimeout(() => {
        held.delete(id);
        settle({ decision: 'deny', reason: autoDenyReason(timeoutMs) });
      }, holdMs);
      timer.unref?.();

      held.set(id, {
        permit: { id, agent, toolName, input, expiresAt: Date.now() + holdMs },
        timer,
        settle,
      });

      return { id, promise };
    },

    resolve(id, decision, reason, updatedInput) {
      const entry = take(id);
      if (!entry) return false;
      entry.settle({ decision, reason, updatedInput });
      return true;
    },

    withdraw(id) {
      const entry = take(id);
      if (!entry) return false;
      entry.settle({ decision: 'withdrawn' });
      return true;
    },

    list() {
      return [...held.values()].map((e) => e.permit);
    },
  };
}
