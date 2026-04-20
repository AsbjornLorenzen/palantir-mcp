/*
 * Copyright (c) 2025 Palantir Technologies
 *
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import fs from 'fs'
import os from 'os'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isJwtExpired,
  loadCachedToken,
  resolveToken,
  saveCachedToken,
} from '../utils/tokenCache.js'

vi.mock('fs')
vi.mock('os', () => ({
  default: { homedir: vi.fn().mockReturnValue('/mock/home') },
  homedir: vi.fn().mockReturnValue('/mock/home'),
}))

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.sig`
}

const EXPIRED_TOKEN = makeJwt({ sub: 'test', exp: Math.floor(Date.now() / 1000) - 3600 })
const VALID_TOKEN = makeJwt({ sub: 'test', exp: Math.floor(Date.now() / 1000) + 3600 })
const CACHED_TOKEN = makeJwt({ sub: 'cached', exp: Math.floor(Date.now() / 1000) + 3600 })

const VALID_CONFIG = JSON.stringify({
  hosts: {
    'https://example.palantirfoundry.com': {
      token: CACHED_TOKEN,
    },
  },
})

describe('tokenCache', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(os.homedir).mockReturnValue('/mock/home')
  })

  describe('loadCachedToken', () => {
    it('should return undefined when config file does not exist', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })

      expect(loadCachedToken('https://example.palantirfoundry.com')).toBeUndefined()
    })

    it('should return the token when host exists in the config', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(VALID_CONFIG)

      expect(loadCachedToken('https://example.palantirfoundry.com')).toBe(CACHED_TOKEN)
    })

    it('should return undefined when host is not in the config', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(VALID_CONFIG)

      expect(loadCachedToken('https://other-host.palantirfoundry.com')).toBeUndefined()
    })

    it('should return undefined when config file contains malformed JSON', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue('not valid json{{{')

      expect(loadCachedToken('https://example.palantirfoundry.com')).toBeUndefined()
    })

    it('should return undefined when token is empty string', () => {
      const config = JSON.stringify({
        hosts: {
          'https://example.palantirfoundry.com': { token: '' },
        },
      })
      vi.spyOn(fs, 'readFileSync').mockReturnValue(config)

      expect(loadCachedToken('https://example.palantirfoundry.com')).toBeUndefined()
    })
  })

  describe('saveCachedToken', () => {
    let writtenContent: string
    let writtenPath: string

    beforeEach(() => {
      vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
      vi.spyOn(fs, 'writeFileSync').mockImplementation((p, content) => {
        writtenPath = p as string
        writtenContent = content as string
      })
      vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
    })

    it('should create a new config when none exists', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT')
      })

      saveCachedToken('https://example.palantirfoundry.com', 'new-token')

      const saved = JSON.parse(writtenContent)
      expect(saved.hosts['https://example.palantirfoundry.com'].token).toBe('new-token')
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.palantir'),
        expect.objectContaining({ recursive: true, mode: 0o700 }),
      )
    })

    it('should merge into existing config without losing other hosts', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(VALID_CONFIG)

      saveCachedToken('https://other.palantirfoundry.com', 'other-token')

      const saved = JSON.parse(writtenContent)
      expect(saved.hosts['https://example.palantirfoundry.com'].token).toBe(CACHED_TOKEN)
      expect(saved.hosts['https://other.palantirfoundry.com'].token).toBe('other-token')
    })

    it('should overwrite token for an existing host', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(VALID_CONFIG)

      saveCachedToken('https://example.palantirfoundry.com', 'refreshed-token')

      const saved = JSON.parse(writtenContent)
      expect(saved.hosts['https://example.palantirfoundry.com'].token).toBe('refreshed-token')
    })

    it('should write to a temp file and rename for atomicity', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT')
      })

      saveCachedToken('https://example.palantirfoundry.com', 'token')

      expect(writtenPath).toContain('.tmp')
      expect(fs.renameSync).toHaveBeenCalled()
    })

    it('should not throw when write fails', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT')
      })
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      expect(() => saveCachedToken('https://example.palantirfoundry.com', 'token')).not.toThrow()
    })
  })

  describe('isJwtExpired', () => {
    it('should return false for a token with future exp', () => {
      expect(isJwtExpired(VALID_TOKEN)).toBe(false)
    })

    it('should return true for a token with past exp', () => {
      expect(isJwtExpired(EXPIRED_TOKEN)).toBe(true)
    })

    it('should return true for a malformed token', () => {
      expect(isJwtExpired('not-a-jwt')).toBe(true)
    })

    it('should return true for a token without exp claim', () => {
      const noExp = makeJwt({ sub: 'test' })
      expect(isJwtExpired(noExp)).toBe(true)
    })
  })

  describe('resolveToken', () => {
    const HOST = 'https://example.palantirfoundry.com'

    it('should prefer a valid CLI token over cache', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(VALID_CONFIG)

      expect(resolveToken(HOST, VALID_TOKEN)).toBe(VALID_TOKEN)
    })

    it('should fall back to cache when CLI token is expired', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(VALID_CONFIG)

      expect(resolveToken(HOST, EXPIRED_TOKEN)).toBe(CACHED_TOKEN)
    })

    it('should use cache when no CLI token is provided', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(VALID_CONFIG)

      expect(resolveToken(HOST, undefined)).toBe(CACHED_TOKEN)
    })

    it('should return expired CLI token as last resort when no cache exists', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT')
      })

      expect(resolveToken(HOST, EXPIRED_TOKEN)).toBe(EXPIRED_TOKEN)
    })

    it('should return undefined when no token is available', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT')
      })

      expect(resolveToken(HOST, undefined)).toBeUndefined()
    })
  })
})
