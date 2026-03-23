import type { SourceAdapter } from "./sourceAdapter.js";

const adapters: SourceAdapter[] = [];

export function registerSource(adapter: SourceAdapter): void {
  adapters.push(adapter);
}

/**
 * Try each adapter's parseUrl until one returns non-null.
 * Returns { adapter, sourceId } or throws if no adapter matches.
 */
export function resolveInput(
  input: string
): { adapter: SourceAdapter; sourceId: string } {
  for (const adapter of adapters) {
    const sourceId = adapter.parseUrl(input);
    if (sourceId !== null) {
      return { adapter, sourceId };
    }
  }
  throw new Error(`No source adapter can handle input: ${input}`);
}

/** Look up adapter by name (for DB records that already have a source column). */
export function getSourceAdapter(name: string): SourceAdapter {
  const adapter = adapters.find((a) => a.name === name);
  if (!adapter) throw new Error(`Unknown source: ${name}`);
  return adapter;
}

/** All registered hostnames across all sources (for the proxy whitelist). */
export function getAllAllowedHostnames(): string[] {
  return adapters.flatMap((a) => a.allowedHostnames);
}

/** Get referer for a given hostname (for proxy and OCR). */
export function getRefererForHostname(hostname: string): string | undefined {
  return adapters.find((a) => a.allowedHostnames.includes(hostname))?.referer;
}
