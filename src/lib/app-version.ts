/**
 * App sync version - increment this when sync architecture changes
 * to force old tabs to reload.
 */
export const APP_SYNC_VERSION = 2

/**
 * Check if the current tab is running an old version and should reload.
 * Stores the version in sessionStorage (tab-specific).
 */
export function checkAndEnforceSyncVersion(): boolean {
  if (typeof window === 'undefined') return true

  try {
    const stored = sessionStorage.getItem('app.sync.version')
    const storedVersion = stored ? parseInt(stored, 10) : 0

    if (storedVersion === 0) {
      // First load in this tab
      sessionStorage.setItem('app.sync.version', APP_SYNC_VERSION.toString())
      return true
    }

    if (storedVersion < APP_SYNC_VERSION) {
      // Old version detected, force reload
      console.warn(
        `Sync version mismatch: current=${storedVersion}, required=${APP_SYNC_VERSION}. Reloading...`,
      )
      sessionStorage.setItem('app.sync.version', APP_SYNC_VERSION.toString())
      window.location.reload()
      return false
    }

    return true
  } catch {
    // sessionStorage not available
    return true
  }
}
