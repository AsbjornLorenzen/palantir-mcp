/*
 * Copyright (c) 2025 Palantir Technologies
 *
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
const CONFIG_DIR = path.join(os.homedir(), '.palantir')
const CONFIG_FILE = path.join(CONFIG_DIR, 'mcp-config.json')

interface HostEntry {
  token: string
  [key: string]: unknown
}

interface PalantirMcpConfig {
  hosts: Record<string, HostEntry>
  [key: string]: unknown
}

function loadConfig(): PalantirMcpConfig | undefined {
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const config = JSON.parse(content)
    if (config && typeof config.hosts === 'object') {
      return config as PalantirMcpConfig
    }
    return undefined
  } catch {
    return undefined
  }
}

function restrictToCurrentUserWindows(targetPath: string): void {
  if (process.platform !== 'win32') {
    return
  }
  try {
    execSync(`icacls "${targetPath}" /inheritance:r /grant:r "%USERNAME%:F"`, {
      stdio: 'ignore',
      windowsHide: true,
    })
  } catch {
    // Best-effort
  }
}

// Write to a temporary file, then rename.
function saveConfig(config: PalantirMcpConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  restrictToCurrentUserWindows(CONFIG_DIR)
  const tmpFile = `${CONFIG_FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(tmpFile, CONFIG_FILE)
  restrictToCurrentUserWindows(CONFIG_FILE)
}

function loadOrCreateConfig(): PalantirMcpConfig {
  return loadConfig() ?? { hosts: {} }
}

export function loadCachedToken(foundryHost: string): string | undefined {
  const config = loadConfig()
  const token = config?.hosts[foundryHost]?.token
  return typeof token === 'string' && token.length > 0 ? token : undefined
}

// Lightweight local check of expiry
export function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return true
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (typeof payload.exp !== 'number') {
      return true
    }
    return payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

/**
 * Priority:
 *  1. CLI/env token if not expired (user may have intentionally updated it)
 *  2. Cached token
 *  3. CLI/env token even if expired (used to refresh via browser)
 */
export function resolveToken(
  foundryHost: string,
  cliToken: string | undefined,
): string | undefined {
  const cachedToken = loadCachedToken(foundryHost)

  if (cliToken && !isJwtExpired(cliToken)) {
    return cliToken
  }

  if (cachedToken) {
    return cachedToken
  }

  // validateFoundryToken needs the expired token to trigger a browser-based refresh
  return cliToken
}

// Creates .palantir directory containing mcp-config.json if they don't exist.
export function saveCachedToken(foundryHost: string, token: string): void {
  try {
    const config = loadOrCreateConfig()
    config.hosts[foundryHost] = { ...config.hosts[foundryHost], token }
    saveConfig(config)
  } catch (error) {
    console.error('Failed to save token to cache:', error)
  }
}
