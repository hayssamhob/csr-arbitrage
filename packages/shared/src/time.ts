// Unified timestamp utilities
// Per llms.md: always use ISO 8601 timestamps and store in UTC

export function nowISO(): string {
  return new Date().toISOString();
}

export function nowMs(): number {
  return Date.now();
}

export function parseTimestamp(ts: string | number): Date {
  if (typeof ts === 'number') {
    // Assume milliseconds if > 10^12, otherwise seconds
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms);
  }
  return new Date(ts);
}

export function toISO(ts: string | number | Date): string {
  if (ts instanceof Date) {
    return ts.toISOString();
  }
  return parseTimestamp(ts).toISOString();
}

export function isStale(lastTs: string | null, maxStalenessMs: number): boolean {
  if (!lastTs) return true;
  const lastTime = new Date(lastTs).getTime();
  return Date.now() - lastTime > maxStalenessMs;
}

export function msSince(ts: string): number {
  return Date.now() - new Date(ts).getTime();
}
