import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { classifyError } from './classify.js'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fx = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8')

describe('classifyError', () => {
  it('classifies EOTP as flip-2fa', () => {
    const r = classifyError('npm error code EOTP\nnpm error This operation requires a one-time password')
    expect(r.action).toBe('flip-2fa-auth-only')
  })

  it('classifies granular+bypass requirement', () => {
    const r = classifyError(
      '403 Forbidden - Two-factor authentication or granular access token with bypass 2fa enabled is required'
    )
    expect(r.action).toBe('rotate-granular-token')
  })

  it('classifies bad password as reset-password blocking', () => {
    const r = classifyError('{"ok":false,"error":"Could not authenticate: bad password"}')
    expect(r.action).toBe('reset-password')
    if (r.action === 'reset-password') expect(r.blocking).toBe(true)
  })

  it('classifies version conflict', () => {
    const r = classifyError('you cannot publish over the previously published versions: 0.4.0')
    expect(r.action).toBe('version-already-exists')
  })

  it('classifies payment-required as fix-publishconfig', () => {
    const r = classifyError('npm error code E402\nnpm error 402 Payment Required')
    expect(r.action).toBe('fix-publishconfig')
  })

  it('classifies rate limit as retry', () => {
    const r = classifyError('HTTP 429 Too Many Requests')
    expect(r.action).toBe('retry')
    if (r.action === 'retry') expect(r.afterSeconds).toBeGreaterThan(0)
  })

  it('falls through to unknown', () => {
    const r = classifyError('something nobody has seen before')
    expect(r.action).toBe('unknown')
  })

  it('generic 403 routes to rotate-granular-token', () => {
    const r = classifyError('403 Forbidden — some other reason')
    expect(r.action).toBe('rotate-granular-token')
  })
})

// Real-world stderr samples captured from production failures. Keeps the
// classifier honest as npm's error wording drifts between CLI releases.
describe('classifier fixtures', () => {
  it('eotp-auth-and-writes.txt -> flip-2fa-auth-only', () => {
    expect(classifyError(fx('eotp-auth-and-writes.txt')).action).toBe('flip-2fa-auth-only')
  })

  it('granular-bypass-required.txt -> rotate-granular-token', () => {
    expect(classifyError(fx('granular-bypass-required.txt')).action).toBe('rotate-granular-token')
  })

  it('bad-password.txt -> reset-password', () => {
    const r = classifyError(fx('bad-password.txt'))
    expect(r.action).toBe('reset-password')
    if (r.action === 'reset-password') expect(r.blocking).toBe(true)
  })

  it('version-conflict.txt -> version-already-exists', () => {
    expect(classifyError(fx('version-conflict.txt')).action).toBe('version-already-exists')
  })

  it('payment-required.txt -> fix-publishconfig', () => {
    expect(classifyError(fx('payment-required.txt')).action).toBe('fix-publishconfig')
  })

  it('rate-limit.txt -> retry', () => {
    const r = classifyError(fx('rate-limit.txt'))
    expect(r.action).toBe('retry')
    if (r.action === 'retry') expect(r.afterSeconds).toBeGreaterThan(0)
  })

  it('generic-403.txt -> rotate-granular-token', () => {
    expect(classifyError(fx('generic-403.txt')).action).toBe('rotate-granular-token')
  })

  it('scope-not-found.txt -> unknown (no automated recovery)', () => {
    expect(classifyError(fx('scope-not-found.txt')).action).toBe('unknown')
  })
})
