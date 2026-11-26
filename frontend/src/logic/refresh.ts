// When the card asks the server again, and what a failed answer means. Pure functions, no DOM.

/** The answers that settle the matter: asking again would not change them. */
const DEFINITIVE = new Set(["unauthorized", "not_found"]);

export type Outcome = "hide" | "missing" | "retry";

/**
 * What a failed request means. `unauthorized` is the normal answer for everybody who may not see the card,
 * `not_found` says the config entry is gone. Everything else (a dropped connection, Home Assistant starting,
 * the integration reloading) is temporary and must not take a card away that was just shown.
 */
export function classify(code: string): Outcome {
  if (code === "unauthorized") return "hide";
  if (code === "not_found") return "missing";
  return "retry";
}

export function isDefinitive(code: string): boolean {
  return DEFINITIVE.has(code);
}

/** Waits between attempts after a failure, in milliseconds. The last value repeats. */
export const RETRY_DELAYS = [2_000, 5_000, 15_000, 60_000];

export function retryDelay(attempt: number, schedule: readonly number[] = RETRY_DELAYS): number {
  return schedule[Math.min(Math.max(attempt, 0), schedule.length - 1)] ?? 60_000;
}

/** A shown card is refreshed this often while the page is visible; each refresh is one cheap request. */
export const REFRESH_EVERY_MS = 5 * 60_000;
/** Coming back to a page that was in the background refreshes a panel older than this. */
export const STALE_AFTER_MS = 60_000;

export function isStale(lastLoad: number | undefined, now: number, limit = STALE_AFTER_MS): boolean {
  return lastLoad === undefined || now - lastLoad >= limit;
}
