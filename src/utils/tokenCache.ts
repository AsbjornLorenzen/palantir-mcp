/*
 * Copyright (c) 2025 Palantir Technologies
 *
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const CONFIG_FILE = path.join(os.homedir(), '.palantir', 'mcp-config.json')

/**
 * Load a cached token for the given Foundry host.
 * The config file is written by @palantir/mcp; this function only reads it.
 */
export function loadCachedToken(foundryHost: string): string | undefined {
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const config = JSON.parse(content)
    const token = config?.hosts?.[foundryHost]?.token
    return typeof token === 'string' && token.length > 0 ? token : undefined
  } catch {
    return undefined
  }
}
