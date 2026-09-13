// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HIDDEN_KEY, parseHidden, useHiddenSessions } from './useHiddenSessions';

afterEach(() => window.localStorage.clear());

describe('parseHidden', () => {
  it('reads back the names it stored', () => {
    expect([...parseHidden('["session-a","session-b"]')]).toEqual(['session-a', 'session-b']);
  });

  it('hides nothing when there is no stored value', () => {
    expect(parseHidden(null).size).toBe(0);
  });

  it('hides nothing rather than throwing on a blob that is not JSON', () => {
    expect(parseHidden('{{{').size).toBe(0);
  });

  // Failing toward "show too much" is deliberate: a picker that silently
  // swallowed a live session is far worse than one that forgot a dismissal.
  it('hides nothing when the stored value is not an array', () => {
    expect(parseHidden('{"session-a":true}').size).toBe(0);
  });

  it('drops non-string and empty entries rather than hiding a blank name', () => {
    expect([...parseHidden('["session-a",7,null,"",{"a":1},"session-b"]')]).toEqual([
      'session-a',
      'session-b',
    ]);
  });
});

describe('useHiddenSessions', () => {
  it('puts one session back, leaving the rest hidden', () => {
    const { result } = renderHook(() => useHiddenSessions());
    act(() => result.current.hide('session-a'));
    act(() => result.current.hide('session-b'));
    act(() => result.current.unhide('session-a'));
    expect([...result.current.hidden]).toEqual(['session-b']);
  });

  it('persists an unhide the same way hide and showAll do', () => {
    const { result } = renderHook(() => useHiddenSessions());
    act(() => result.current.hide('session-a'));
    act(() => result.current.hide('session-b'));
    act(() => result.current.unhide('session-a'));
    expect(JSON.parse(window.localStorage.getItem(HIDDEN_KEY)!)).toEqual(['session-b']);
  });
});
