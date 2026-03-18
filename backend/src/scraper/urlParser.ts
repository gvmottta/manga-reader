export function parseQToonUrl(input: string): string {
  const trimmed = input.trim();

  // Full URL: extract ID from path (handles locale prefixes like /pt/, /es/, etc.)
  if (trimmed.includes("qtoon.com")) {
    const match = trimmed.match(
      /qtoon\.com\/(?:[a-z]{2}\/)?(?:detail|reader)\/([a-zA-Z0-9_]+)/
    );
    if (match?.[1]) return match[1];
    throw new Error(`Invalid QToon URL: ${trimmed}`);
  }

  // Bare ID
  if (/^[a-zA-Z0-9_]+$/.test(trimmed)) return trimmed;

  throw new Error(`Invalid QToon URL or ID: ${trimmed}`);
}
