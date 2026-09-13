// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { themeFor } from '../../shared/cast';
import { THEMES } from '../themes';
import {
  DEFAULT_SETTINGS,
  FOLDER_SETTINGS_KEY,
  SETTINGS_KEY,
  parseSettings,
  useSettings,
} from './useSettings';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('parseSettings', () => {
  it('defaults an empty store', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults rather than throwing on a corrupt blob', () => {
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('"a string"')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });

  it('reads a full stored blob back', () => {
    const stored = {
      theme: 'phosphor', scheme: 'c', density: 'roomy', movieTheme: 'lotr',
      fade: false, avatars: false, motion: false, numbers: false,
      filmPalette: false, showRateCard: false,
    };
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it('defaults the rate card visible, including on a blob written before it', () => {
    // The usage view reads this; it is written here. Visible out of the box.
    expect(DEFAULT_SETTINGS.showRateCard).toBe(true);
    expect(parseSettings(JSON.stringify({ theme: 'ember' })).showRateCard).toBe(true);
  });

  it('drives the film palette by default, so picking a film shows the grade', () => {
    expect(DEFAULT_SETTINGS.filmPalette).toBe(true);
    expect(parseSettings(null).filmPalette).toBe(true);
  });

  it('defaults the film-palette switch on a blob written before it existed', () => {
    expect(parseSettings(JSON.stringify({ theme: 'ember' })).filmPalette).toBe(true);
    expect(parseSettings(JSON.stringify({ filmPalette: 'yes' })).filmPalette).toBe(true);
  });

  it('starts with no movie theme', () => {
    expect(DEFAULT_SETTINGS.movieTheme).toBeNull();
    expect(parseSettings(null).movieTheme).toBeNull();
  });

  it('stores the off theme as null rather than as a key', () => {
    expect(parseSettings(JSON.stringify({ movieTheme: 'off' })).movieTheme).toBeNull();
  });

  it('rejects a movie theme the database does not have', () => {
    expect(parseSettings(JSON.stringify({ movieTheme: 'a film nobody made' })).movieTheme).toBeNull();
    expect(parseSettings(JSON.stringify({ movieTheme: 7 })).movieTheme).toBeNull();
  });

  // Field by field on purpose: a whole-object cast would put an unknown theme
  // id on the console root, where it resolves to no colours at all.
  it('keeps the fields it recognises and defaults only the rest', () => {
    const parsed = parseSettings(JSON.stringify({ theme: 'ember', density: 'nope', fade: 'yes' }));
    expect(parsed.theme).toBe('ember');
    expect(parsed.density).toBe(DEFAULT_SETTINGS.density);
    expect(parsed.fade).toBe(DEFAULT_SETTINGS.fade);
    expect(parsed.scheme).toBe(DEFAULT_SETTINGS.scheme);
  });

  it('rejects a theme id from a build that had one this one does not', () => {
    expect(parseSettings(JSON.stringify({ theme: 'sepia' })).theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('stores under a key that names the machine-wide scope', () => {
    expect(SETTINGS_KEY).toBe('console.appearance');
  });
});

// The switch is what makes "a theme sets names only" a choice rather than a law.
// `theme` is the remembered system theme throughout: it can only ever hold a
// system id, so it is already the fallback the switch needs, and a second field
// holding the same value could only drift from it.
describe('the film palette switch', () => {
  const inception = themeFor('inception').palette!;

  it('paints the film grade while a film drives', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.set('movieTheme', 'inception'));
    expect(result.current.vars['--color-bg']).toBe(inception.bg);
    expect(result.current.vars['--color-accent']).toBe(inception.accent.base);
    expect(result.current.vars['--warn']).toBe(inception.warn);
    expect(result.current.vars['--color-neutral-200']).toBe(THEMES.nocturne.n[0]);
  });

  it('restores the remembered system theme the moment the switch goes off', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.set('theme', 'phosphor'));
    act(() => result.current.set('movieTheme', 'inception'));
    expect(result.current.vars['--color-bg']).toBe(inception.bg);

    act(() => result.current.set('filmPalette', false));
    // Same render, not a reload: the ground is Phosphor's again.
    expect(result.current.vars['--color-bg']).toBe(THEMES.phosphor.bg);
    expect(result.current.vars['--term']).toBe(THEMES.phosphor.term);
    expect(result.current.vars['--warn']).toBe(THEMES.phosphor.warn);
    // The film is still cast — the switch reaches colour only.
    expect(result.current.settings.movieTheme).toBe('inception');
  });

  it('leaves the ground alone when no film is picked, switch on or off', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.set('theme', 'ember'));
    const ground = result.current.vars['--color-bg'];
    act(() => result.current.set('filmPalette', false));
    expect(result.current.vars['--color-bg']).toBe(ground);
    act(() => result.current.set('filmPalette', true));
    expect(result.current.vars['--color-bg']).toBe(ground);
    expect(ground).toBe(THEMES.ember.bg);
  });

  it('persists the switch beside the film', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.set('movieTheme', 'lotr'));
    act(() => result.current.set('filmPalette', false));
    const stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!);
    expect(stored.movieTheme).toBe('lotr');
    expect(stored.filmPalette).toBe(false);
    expect(stored.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});

describe('a folder theme', () => {
  const HERE = '/work/alpha';
  const store = (global: object, folders: unknown) => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(global));
    window.localStorage.setItem(FOLDER_SETTINGS_KEY, JSON.stringify(folders));
  };
  const storedFolders = () => JSON.parse(window.localStorage.getItem(FOLDER_SETTINGS_KEY) ?? 'null');
  const storedGlobal = () => parseSettings(window.localStorage.getItem(SETTINGS_KEY));

  it('stores under its own key, beside the machine-wide one', () => {
    expect(FOLDER_SETTINGS_KEY).toBe('console.appearance.folders');
  });

  it('lands on top of the all-folders settings', () => {
    store({ theme: 'ember', density: 'roomy' }, { [HERE]: { theme: 'frost' } });
    const { result } = renderHook(() => useSettings(HERE));
    expect(result.current.settings.theme).toBe('frost');
    expect(result.current.settings.density).toBe('roomy');
    expect(result.current.vars['--color-bg']).toBe(THEMES.frost.bg);
  });

  it('is not worn by a session in another folder', () => {
    store({ theme: 'ember' }, { [HERE]: { theme: 'frost' } });
    const { result } = renderHook(() => useSettings('/work/beta'));
    expect(result.current.settings.theme).toBe('ember');
  });

  it('keeps an explicit film-off as a folder choice', () => {
    store({ movieTheme: 'lotr' }, { [HERE]: { movieTheme: null } });
    const { result } = renderHook(() => useSettings(HERE));
    expect(result.current.settings.movieTheme).toBeNull();
  });

  it('opens in folder scope on a folder that already has a theme, else in all-folders scope', () => {
    store({}, { [HERE]: { theme: 'frost' } });
    expect(renderHook(() => useSettings(HERE)).result.current.folder?.scope).toBe('folder');
    expect(renderHook(() => useSettings('/work/beta')).result.current.folder?.scope).toBe('all');
  });

  it('writes a look field to the folder key only in folder scope', () => {
    const { result } = renderHook(() => useSettings(HERE));
    act(() => result.current.folder!.setScope('folder'));
    act(() => result.current.set('theme', 'phosphor'));
    expect(result.current.settings.theme).toBe('phosphor');
    expect(storedFolders()).toEqual({ [HERE]: { theme: 'phosphor' } });
    expect(storedGlobal().theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.current.folder!.global.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('writes a look field globally in all-folders scope', () => {
    const { result } = renderHook(() => useSettings(HERE));
    act(() => result.current.set('theme', 'phosphor'));
    expect(storedGlobal().theme).toBe('phosphor');
    expect(storedFolders()).toBeNull();
  });

  it('always writes a non-look field globally', () => {
    const { result } = renderHook(() => useSettings(HERE));
    act(() => result.current.folder!.setScope('folder'));
    act(() => result.current.set('density', 'compact'));
    expect(storedGlobal().density).toBe('compact');
    expect(storedFolders()).toBeNull();
  });

  it('clearing the folder puts the all-folders theme back', () => {
    store({ theme: 'ember' }, { [HERE]: { theme: 'frost' }, '/work/beta': { theme: 'slate' } });
    const { result } = renderHook(() => useSettings(HERE));
    act(() => result.current.folder!.clear());
    expect(result.current.settings.theme).toBe('ember');
    expect(result.current.folder!.overridden).toBe(false);
    expect(storedFolders()).toEqual({ '/work/beta': { theme: 'slate' } });
  });

  it('has no folder scope when no folder is known', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.folder).toBeUndefined();
    act(() => result.current.set('theme', 'phosphor'));
    expect(storedGlobal().theme).toBe('phosphor');
  });

  it('falls back to the all-folders settings on a garbage folder store', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'ember' }));
    for (const raw of [
      '{not json',
      '"a string"',
      JSON.stringify({ [HERE]: 'frost' }),
      JSON.stringify({ [HERE]: { theme: 'sepia', scheme: 7, movieTheme: 'a film nobody made' } }),
    ]) {
      window.localStorage.setItem(FOLDER_SETTINGS_KEY, raw);
      const { result } = renderHook(() => useSettings(HERE));
      expect(result.current.settings.theme, raw).toBe('ember');
      expect(result.current.folder!.overridden, raw).toBe(false);
    }
  });

  it('keeps the fields a folder entry gets right and drops the rest', () => {
    store({}, { [HERE]: { theme: 'frost', scheme: 'nope', density: 'roomy' } });
    const { result } = renderHook(() => useSettings(HERE));
    expect(result.current.settings.theme).toBe('frost');
    expect(result.current.settings.scheme).toBe(DEFAULT_SETTINGS.scheme);
    // Density is never a folder field, whatever the blob says.
    expect(result.current.settings.density).toBe(DEFAULT_SETTINGS.density);
  });

  it('falls back to global on a store that throws, and still takes a folder pick in memory', () => {
    const boom = () => {
      throw new Error('blocked origin');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, clear: () => {} });
    const { result } = renderHook(() => useSettings(HERE));
    expect(result.current.settings.theme).toBe(DEFAULT_SETTINGS.theme);
    act(() => result.current.folder!.setScope('folder'));
    act(() => result.current.set('theme', 'ember'));
    expect(result.current.settings.theme).toBe('ember');
    act(() => result.current.folder!.clear());
    expect(result.current.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
