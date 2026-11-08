import { afterEach, expect, it, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import { createStream } from './stream';

const client = () => {
  const res = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() };
  return { res, as: res as unknown as ServerResponse };
};
const state = (teamName: string) => ({ teamName }) as unknown as Parameters<typeof createStream>[0] extends () => infer S ? S : never;

afterEach(() => vi.useRealTimers());

it('hands a released client to another hub on its open socket, with that hub\'s snapshot', () => {
  vi.useFakeTimers();
  const a = createStream(() => state('alpha'), 10);
  const b = createStream(() => state('beta'), 10);
  const tagged = client();
  const bare = client();
  a.subscribe(tagged.as, 'other-session');
  a.subscribe(bare.as);
  expect(a.clients).toBe(2);

  const released = a.release((tag) => tag === undefined);
  expect(released.map((r) => r.tag)).toEqual(['other-session']);
  expect(a.clients).toBe(1);

  b.adopt(released[0].res, released[0].tag);
  expect(b.clients).toBe(1);
  // No second set of headers: the socket already has them from `a`.
  expect(tagged.res.writeHead).toHaveBeenCalledTimes(1);
  expect(tagged.res.write).toHaveBeenLastCalledWith(expect.stringContaining('event: snapshot\ndata: {"teamName":"beta"}'));

  a.publish();
  vi.advanceTimersByTime(20);
  expect(bare.res.write).toHaveBeenLastCalledWith(expect.stringContaining('"teamName":"alpha"'));
  expect(tagged.res.write).toHaveBeenCalledTimes(2);
  a.close();
  b.close();
});
