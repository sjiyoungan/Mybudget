/**
 * Stale-tab guard: Check build version and reload when stale.
 * 
 * Exposes BUILD_ID and checks it on window focus and every 60s.
 * Reloads when the server's version differs from the bundle's own id.
 */

// Build ID from environment variable or generated timestamp
export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 
                        import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || 
                        '__dev__'

let checkTimer: ReturnType<typeof setInterval> | null = null
let isChecking = false

async function checkVersion(): Promise<void> {
  if (isChecking) return
  isChecking = true
  
  try {
    const response = await fetch('/version.json', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    
    if (!response.ok) return
    
    const data = await response.json() as { buildId?: string }
    const serverBuildId = data.buildId
    
    if (serverBuildId && serverBuildId !== BUILD_ID && BUILD_ID !== '__dev__') {
      console.info('New version detected, reloading...', {
        current: BUILD_ID,
        server: serverBuildId,
      })
      window.location.reload()
    }
  } catch (error) {
    // Network error or parse error, ignore
    console.debug('Version check failed:', error)
  } finally {
    isChecking = false
  }
}

/**
 * Start the version guard.
 * Checks on window focus and every 60 seconds.
 */
export function startVersionGuard(): void {
  if (checkTimer) return
  
  // Check every 60 seconds
  checkTimer = setInterval(() => {
    void checkVersion()
  }, 60000)
  
  // Check on window focus
  const handleFocus = () => {
    void checkVersion()
  }
  window.addEventListener('focus', handleFocus)
  
  // Initial check
  void checkVersion()
}

/**
 * Stop the version guard (cleanup).
 */
export function stopVersionGuard(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
