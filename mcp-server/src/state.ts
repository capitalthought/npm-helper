/**
 * Per-user state file for npm-helper. Tracks which packages we manage,
 * where their creds live, and when they were last rotated.
 *
 * Stored at ~/.config/npm-helper/state.json — plain JSON, no secrets
 * (only sha256 fingerprints of tokens).
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const STATE_PATH = path.join(homedir(), '.config', 'npm-helper', 'state.json')

export interface AccountEntry {
  npm_user: string
  onepass_item_id: string
  pw_field: string
  recovery_codes_field?: string
  fallback_2fa?: 'webauthn' | 'totp' | 'recovery-only'
}

export interface PackageEntry {
  account: string
  repo?: string
  publish_workflow?: string
  gh_secret_name?: string
  vercel_projects?: string[]
  token_id?: string
  token_sha256?: string
  token_last_rotated?: string
  token_scope?: string
  two_factor_level?: 'disabled' | 'auth-only' | 'auth-and-writes'
}

export interface State {
  accounts: Record<string, AccountEntry>
  packages: Record<string, PackageEntry>
}

export async function loadState(): Promise<State> {
  try {
    const buf = await fs.readFile(STATE_PATH, 'utf8')
    return JSON.parse(buf) as State
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { accounts: {}, packages: {} }
    }
    throw err
  }
}

export async function saveState(state: State): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true })
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

export function fingerprintToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function statePath(): string {
  return STATE_PATH
}
