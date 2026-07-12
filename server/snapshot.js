// Backup / point-in-time snapshot policy helpers. Kept pure (no DB) so the
// cadence logic is unit-testable. The single-document store is overwritten on
// every save, so periodic snapshots provide recovery from a bad write or
// corruption without unbounded history growth.

export const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000 // at most one snapshot per 15 min of activity
export const SNAPSHOT_KEEP = 100                    // retain the most recent N snapshots

// Capture a new snapshot only when the previous one is older than the interval,
// so history size stays bounded regardless of how often the app saves.
export function shouldSnapshot(lastSavedAtMs, nowMs = Date.now(), intervalMs = SNAPSHOT_INTERVAL_MS) {
  if (!lastSavedAtMs) return true
  return nowMs - lastSavedAtMs >= intervalMs
}
