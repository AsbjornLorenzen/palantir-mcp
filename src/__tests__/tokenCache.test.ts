/*
 * Copyright (c) 2025 Palantir Technologies
 *
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

import fs from 'fs'
import os from 'os'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadCachedToken } from '../utils/tokenCache.js'

vi.mock('fs')
vi.mock('os', () => ({
  default: { homedir: vi.fn().mockReturnValue('/mock/home') },
  homedir: vi.fn().mockReturnValue('/mock/home'),
}))

const VALID_CONFIG = JSON.stringify({
  hosts: {
    'https://example.palantirfoundry.com': {
      token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig',
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

      expect(loadCachedToken('https://example.palantirfoundry.com')).toBe(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig',
      )
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
})
