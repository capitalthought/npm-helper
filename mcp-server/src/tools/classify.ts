/**
 * Deterministic npm error classifier.
 *
 * The whole plugin exists to stop the LLM from re-inventing this decision
 * tree mid-session. Every npm stderr flows through here and gets mapped
 * to exactly one recovery action. Contradictory recovery chains are
 * impossible because this file is the single source of truth.
 *
 * Adding a new pattern? Add a stderr sample to
 * `__tests__/fixtures/<name>.txt` so regressions get caught.
 */

export type Classification =
  | { action: 'flip-2fa-auth-only'; reason: string }
  | { action: 'rotate-granular-token'; reason: string; url?: string }
  | { action: 'reset-password'; reason: string; blocking: true; url?: string }
  | { action: 'retry'; reason: string; afterSeconds: number }
  | { action: 'fix-publishconfig'; reason: string; fix: { field: string; value: unknown } }
  | { action: 'human-in-browser'; reason: string; url: string }
  | { action: 'version-already-exists'; reason: string }
  | { action: 'unknown'; stderr: string }

export function classifyError(stderr: string): Classification {
  const s = stderr || ''

  // EOTP — account 2FA auth-and-writes is prompting for OTP at publish time.
  if (/EOTP|requires a one-time password/i.test(s)) {
    return {
      action: 'flip-2fa-auth-only',
      reason:
        'Account 2FA is set to auth-and-writes, which prompts for an OTP on every publish. Classic automation tokens do NOT bypass this — only granular tokens with bypass-2fa do, OR flipping the account to auth-only.',
    }
  }

  // Package policy rejects current token type.
  if (
    /granular access token with bypass 2fa|granular access token with bypass-2fa|requires granular token/i.test(
      s
    )
  ) {
    return {
      action: 'rotate-granular-token',
      reason:
        "Package-level publishing access requires a granular access token with bypass-2fa enabled. Current token is likely classic automation (doesn't satisfy the policy).",
      url: 'https://www.npmjs.com/settings/<user>/tokens/granular-access-tokens/new',
    }
  }

  // Stale password — this breaks every CLI flow that re-prompts for pw.
  if (/Incorrect password|bad password/i.test(s)) {
    return {
      action: 'reset-password',
      reason:
        'npm rejected the password with 401. The password in 1Password is stale relative to npm. Every CLI path that reconfirms password (token create, profile enable-2fa, login) will fail until this is fixed.',
      blocking: true,
      url: 'https://www.npmjs.com/settings/<user>/account',
    }
  }

  // Version already exists — benign, just bump.
  if (/you cannot publish over the previously published versions|EPUBLISHCONFLICT/i.test(s)) {
    return {
      action: 'version-already-exists',
      reason:
        'This version is already on the registry. Bump the patch version and retry (git and package.json both need the new number).',
    }
  }

  // Scoped package without --access=public on first publish.
  if (/E402 Payment Required|payment required/i.test(s)) {
    return {
      action: 'fix-publishconfig',
      reason:
        'Scoped packages need `publishConfig.access = "public"` in package.json for the first publish to an @scope/pkg on the free tier.',
      fix: { field: 'publishConfig.access', value: 'public' },
    }
  }

  // Rate-limited by npm or gh.
  if (/rate limit|Too Many Requests|HTTP 429/i.test(s)) {
    return {
      action: 'retry',
      reason: 'Rate-limited by the registry. Back off and retry once.',
      afterSeconds: 60,
    }
  }

  // Generic 403 — usually missing scope on the token.
  if (/403 Forbidden/i.test(s)) {
    return {
      action: 'rotate-granular-token',
      reason:
        'Generic 403 from npm registry — the current token likely lacks write scope on this package, or the package policy changed.',
    }
  }

  // Scope mismatch / package not found.
  if (/404 Not Found|no such package/i.test(s)) {
    return {
      action: 'unknown',
      stderr:
        'npm 404 — usually a scope/name mismatch. Check package.json `name` vs. the scope your token is authorized for. For a brand-new scoped package, the first publish needs --access=public.',
    }
  }

  return { action: 'unknown', stderr: s.slice(0, 2000) }
}
