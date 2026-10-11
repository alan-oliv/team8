import catalogJson from './catalog.json';

export interface PricingTier {
  input: number; output: number;            // USD per million tokens
  cacheWrite5m: number; cacheWrite1h: number; cacheRead: number;
  webSearch: number;                        // USD per request
}
export interface ResolvedModel {
  canonical: string; window: number; compactAt: number; pricing: PricingTier; approximate: boolean;
}

interface CatalogFile {
  version: string;
  outputReserve: number;
  compactHeadroom: number;
  fallbackModel: string;
  fallbackWindow: number;
  aliases: Record<string, string>;
  models: Record<string, { window: number; pricing: PricingTier; longPrompt?: { over: number; pricing: PricingTier } }>;
}

const catalog = catalogJson as CatalogFile;

export function compactAtFor(window: number): number {
  return window - catalog.outputReserve - catalog.compactHeadroom;
}

function normalise(raw: string): string {
  const lower = raw.trim().toLowerCase();
  const noWindowSuffix = lower.replace(/\[1m\]$/, '');
  const undated = noWindowSuffix.replace(/-\d{8}$/, '');
  return catalog.aliases[undated] ?? undated;
}

export function resolveModel(raw: string | undefined): ResolvedModel {
  const canonical = raw ? normalise(raw) : '';
  const entry = catalog.models[canonical];
  if (entry) {
    return {
      canonical,
      window: entry.window,
      compactAt: compactAtFor(entry.window),
      pricing: entry.pricing,
      approximate: false,
    };
  }
  // A point release (claude-fable-5-1) shares its family's window; the price
  // is the family's until the catalog names it, so it stays approximate.
  const family = catalog.models[canonical.replace(/-\d+$/, '')];
  if (family) {
    return {
      canonical,
      window: family.window,
      compactAt: compactAtFor(family.window),
      pricing: family.pricing,
      approximate: true,
    };
  }
  return {
    canonical: canonical || 'unknown',
    window: catalog.fallbackWindow,
    compactAt: compactAtFor(catalog.fallbackWindow),
    pricing: catalog.models[catalog.fallbackModel].pricing,
    approximate: true,
  };
}

/**
 * The tier one request is billed at. claude-haiku-5-5 has two rate cards: its
 * long-prompt card applies once a request's prompt (input plus cache reads and
 * writes) is over 100K tokens. Every other model has one.
 */
export function pricingFor(raw: string | undefined, promptTokens: number): PricingTier {
  return longPromptPricing(raw, promptTokens) ?? resolveModel(raw).pricing;
}

export function longPromptPricing(raw: string | undefined, promptTokens: number): PricingTier | undefined {
  const long = catalog.models[resolveModel(raw).canonical]?.longPrompt;
  return long && promptTokens > long.over ? long.pricing : undefined;
}
