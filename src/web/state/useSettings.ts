import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { MOVIE_THEMES, themeFor, type FilmPalette } from '../../shared/cast';
import {
  ACCENT_KEYS,
  DENSITY,
  DENSITY_IDS,
  THEME_IDS,
  cssVarsFor,
  type AccentKey,
  type Density,
  type ThemeId,
} from '../themes';

export interface Settings {
  theme: ThemeId;
  scheme: AccentKey;
  density: Density;
  /** The per-line opacity ladder in transcripts. */
  fade: boolean;
  /** The 8-bit faces. */
  avatars: boolean;
  /** Cursor blink and the typing dots. Off is also the accessible setting. */
  motion: boolean;
  /** The gutter in an expanded JSON payload. */
  numbers: boolean;
  /** The film the team is cast from; null is off, and off is the real names. */
  movieTheme: string | null;
  /**
   * Whether the picked film's grade drives the console's colours too. Off, the
   * film reaches names and portrait tints only and the ground stays on `theme`
   * — which is why `theme` is the fallback and no second field records one: it
   * can only ever hold a system id, so it IS the last system theme picked.
   */
  filmPalette: boolean;
  /** The $/M rate card in the team usage view. Read there, written here. */
  showRateCard: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'nocturne',
  scheme: 'a',
  density: 'default',
  fade: true,
  avatars: true,
  motion: true,
  numbers: true,
  movieTheme: null,
  filmPalette: true,
  showRateCard: true,
};

// Appearance is a property of this machine, not of the team being watched — a
// console reopened on another session keeps the operator's theme.
export const SETTINGS_KEY = 'console.appearance';

const inList = <T,>(list: readonly T[], value: unknown): value is T =>
  list.includes(value as T);

// The database's own `off` entry is the absence of a theme, and the setting
// already spells that null — one value for off rather than two.
const CAST_KEYS = MOVIE_THEMES.map((theme) => theme.key).filter((key) => key !== 'off');

// One look per folder on top of the machine-wide settings, so sessions in
// different folders tell apart at a glance. Only these four travel per folder.
export const FOLDER_SETTINGS_KEY = 'console.appearance.folders';

const LOOK_KEYS = ['theme', 'scheme', 'movieTheme', 'filmPalette'] as const;
type Look = Pick<Settings, (typeof LOOK_KEYS)[number]>;
type FolderLooks = Record<string, Partial<Look>>;

const BOOL_KEYS = ['fade', 'avatars', 'motion', 'numbers', 'filmPalette', 'showRateCard'] as const;

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Field by field, so a stored blob from an older build — or a hand-edited one —
 * contributes what it can and nothing else. A whole-object cast would put an
 * unknown theme id on the root, where it resolves to no colours at all.
 */
function knownFields(s: Record<string, unknown>): Partial<Settings> {
  const known: Partial<Settings> = {};
  if (inList(THEME_IDS, s.theme)) known.theme = s.theme;
  if (inList(ACCENT_KEYS, s.scheme)) known.scheme = s.scheme;
  if (inList(DENSITY_IDS, s.density)) known.density = s.density;
  // A stored null is a real choice: a folder has to be able to turn a global film off.
  if (s.movieTheme === null || inList(CAST_KEYS, s.movieTheme)) known.movieTheme = s.movieTheme;
  for (const key of BOOL_KEYS) {
    const value = s[key];
    if (typeof value === 'boolean') known[key] = value;
  }
  return known;
}

export function parseSettings(raw: string | null): Settings {
  const stored = parseObject(raw);
  return stored ? { ...DEFAULT_SETTINGS, ...knownFields(stored) } : DEFAULT_SETTINGS;
}

function parseFolders(raw: string | null): FolderLooks {
  const looks: FolderLooks = {};
  for (const [folder, entry] of Object.entries(parseObject(raw) ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    const known = knownFields(entry as Record<string, unknown>);
    const look = Object.fromEntries(LOOK_KEYS.filter((k) => k in known).map((k) => [k, known[k]]));
    if (Object.keys(look).length > 0) looks[folder] = look;
  }
  return looks;
}

function read<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(window.localStorage.getItem(key));
  } catch {
    // Private browsing and a blocked origin both throw on access, not on write.
    return parse(null);
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store costs persistence, never the session in hand.
  }
}

export type Scope = 'all' | 'folder';

export interface FolderScope {
  path: string;
  /** Where a look pick lands, and so which values the look pickers show. */
  scope: Scope;
  setScope(scope: Scope): void;
  /** The all-folders settings, which the pickers show in `all` scope. */
  global: Settings;
  overridden: boolean;
  clear(): void;
}

export interface SettingsStore {
  settings: Settings;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  reset(): void;
  /** Theme colours for the console root. */
  vars: Record<string, string>;
  /** Transcript line gap for the chosen density, in px. */
  gap: number;
  /** Absent while the watched session has no folder: everything is global then. */
  folder?: FolderScope;
}

/**
 * The film grade currently driving, if one is. `themeFor(null)` is the off
 * entry and carries no palette, so "no film" and "switch off" collapse to the
 * same absent value. Shared rather than inlined because the portraits lift
 * against this same ground — two copies of the rule could disagree.
 */
export function activePalette(settings: Settings): FilmPalette | undefined {
  return settings.filmPalette ? themeFor(settings.movieTheme).palette : undefined;
}

export function useSettings(folder?: string): SettingsStore {
  const [global, setGlobal] = useState<Settings>(() => read(SETTINGS_KEY, parseSettings));
  const [folders, setFolders] = useState<FolderLooks>(() => read(FOLDER_SETTINGS_KEY, parseFolders));
  // Held against the folder it was picked for, so moving to another session's
  // folder drops it rather than carrying the last folder's choice across.
  const [picked, setPicked] = useState<{ folder: string; scope: Scope } | null>(null);

  const override = folder ? folders[folder] : undefined;
  // Unpicked, the scope is wherever this folder's look comes from, so the
  // pickers open on what is actually painted.
  const scope: Scope = picked && picked.folder === folder ? picked.scope : override ? 'folder' : 'all';
  const settings = useMemo(() => ({ ...global, ...override }), [global, override]);

  const set = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      if (folder && scope === 'folder' && inList(LOOK_KEYS, key)) {
        setFolders((prev) => {
          const next = { ...prev, [folder]: { ...prev[folder], [key]: value } };
          write(FOLDER_SETTINGS_KEY, next);
          return next;
        });
        return;
      }
      setGlobal((prev) => {
        const next = { ...prev, [key]: value };
        write(SETTINGS_KEY, next);
        return next;
      });
    },
    [folder, scope],
  );

  const reset = useCallback(() => {
    setGlobal(DEFAULT_SETTINGS);
    write(SETTINGS_KEY, DEFAULT_SETTINGS);
  }, []);

  const clear = useCallback(() => {
    if (!folder) return;
    setFolders((prev) => {
      const next = { ...prev };
      delete next[folder];
      write(FOLDER_SETTINGS_KEY, next);
      return next;
    });
  }, [folder]);

  const vars = useMemo(
    () => cssVarsFor(settings.theme, settings.scheme, activePalette(settings)),
    [settings.theme, settings.scheme, settings.movieTheme, settings.filmPalette],
  );

  return {
    settings,
    set,
    reset,
    vars,
    gap: DENSITY[settings.density],
    folder: folder
      ? {
          path: folder,
          scope,
          setScope: (next) => setPicked({ folder, scope: next }),
          global,
          overridden: override !== undefined,
          clear,
        }
      : undefined,
  };
}

// Read by the leaves that have to change shape rather than colour — the feed's
// line gap, the fade ladder, the portraits, the JSON gutter. Colour needs no
// context at all: it resolves through the custom properties on the root.
export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);

export function useAppearance(): Settings {
  return useContext(SettingsContext);
}
