#!/usr/bin/env node

/**
 * Generate version.json with the current build ID.
 * Uses VITE_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or timestamp.
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const buildId = 
  process.env.VITE_BUILD_ID || 
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  `build-${Date.now()}`

const versionJson = {
  buildId,
  generatedAt: new Date().toISOString(),
}

const distPath = join(rootDir, 'dist', 'version.json')

writeFileSync(distPath, JSON.stringify(versionJson, null, 2))

console.log(`Generated version.json with buildId: ${buildId}`)
