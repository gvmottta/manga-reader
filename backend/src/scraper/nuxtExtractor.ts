import * as cheerio from "cheerio";

function resolveNuxt3Payload(arr: unknown[]): Record<string, unknown> {
  const resolving = new Set<number>();

  function resolveRef(idx: number): unknown {
    if (resolving.has(idx)) return null;
    if (idx < 0 || idx >= arr.length) return undefined;
    resolving.add(idx);
    const result = resolveValue(arr[idx]);
    resolving.delete(idx);
    return result;
  }

  function resolveValue(val: unknown): unknown {
    if (Array.isArray(val)) {
      if (
        val.length === 2 &&
        val[0] === "ShallowReactive" &&
        typeof val[1] === "number"
      ) {
        return resolveRef(val[1]);
      }
      return val.map((v) =>
        typeof v === "number" ? resolveRef(v) : resolveValue(v)
      );
    }
    if (val !== null && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = typeof v === "number" ? resolveRef(v) : resolveValue(v);
      }
      return result;
    }
    return val;
  }

  // arr[1] = root object { data: 2, ... }
  // arr[2] = ["ShallowReactive", 3]
  // arr[3] = API data store { "/api/w/...": 11, ... }
  // Resolve the data store directly
  const dataStore = resolveRef(3);
  return (dataStore ?? {}) as Record<string, unknown>;
}

export function extractNuxtData(html: string): Record<string, unknown> {
  const $ = cheerio.load(html);

  // Nuxt 3: inline JSON payload in <script id="__NUXT_DATA__" type="application/json">
  const nuxtDataScript = $("#__NUXT_DATA__").html();
  if (nuxtDataScript) {
    try {
      const arr = JSON.parse(nuxtDataScript) as unknown[];
      if (Array.isArray(arr)) {
        return resolveNuxt3Payload(arr);
      }
    } catch {
      // fall through to legacy extraction
    }
  }

  // Legacy Nuxt 2: window.__NUXT__ = (function(...){...})
  let nuxtData: Record<string, unknown> | null = null;
  $("script").each((_i, el) => {
    const content = $(el).html();
    if (content && content.includes("window.__NUXT__")) {
      const match = content.match(
        /window\.__NUXT__\s*=\s*(.+?)(?:;\s*$|\s*$)/ms
      );
      if (match && match[1]) {
        try {
          const fn = new Function(`return ${match[1]}`);
          nuxtData = fn();
        } catch {
          const jsonMatch = content.match(/data:\s*(\{[\s\S]*?\})\s*,?\s*\n/);
          if (jsonMatch) {
            try {
              nuxtData = JSON.parse(jsonMatch[1]);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    }
  });

  if (!nuxtData) {
    throw new Error("Could not extract __NUXT__ data from page");
  }

  return nuxtData;
}

export function findInNuxtData(
  data: unknown,
  key: string
): unknown | undefined {
  if (data === null || data === undefined || typeof data !== "object") {
    return undefined;
  }

  const obj = data as Record<string, unknown>;
  if (key in obj) {
    return obj[key];
  }

  for (const val of Object.values(obj)) {
    if (typeof val === "object" && val !== null) {
      const found = findInNuxtData(val, key);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}
