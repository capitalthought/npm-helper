---
name: npm-doctor
description: Read-only diagnosis of npm ↔ 1Password ↔ GitHub Actions credential drift for a package. Reports what's stale and what to do. Side-effect free.
---

# npm-doctor

Tell the user exactly where their credentials are out of sync. Never writes anything — recommendations only.

## Checks

1. **`npm whoami`** — which account is the CLI logged in as? Does it match state?
2. **`npm profile get`** — what's the account 2FA level? (`disabled`, `auth-only`, `auth-and-writes`)
3. **`npm token list`** — which tokens currently exist? Cross-ref against state's `token_id`.
4. **Package publishing access** — `npm access get @scope/pkg` (or scrape `/access` page) — is the package set to require granular+bypass or accept automation tokens?
5. **1Password** — does the Npmjs item's password field hash match what npm accepts? Test with `curl -X PUT .../-/user/org.couchdb.user:<user>` (401 = stale).
6. **GitHub Actions secret** — secret exists? (can't read value, only list.) Last-updated timestamp recent?
7. **Vercel envs** (if configured) — same check.

## Output

Print a per-package table:

```
@capitalthought/highfives-mcp · doctor

  npm account:        capitalthought                     ✅
  account 2FA:        disabled                           ✅ (publishes bypass OTP)
  package policy:     granular+bypass required           ⚠ current NPM_TOKEN is classic automation → E403
  1Password pw:       stale (401 from registry)          ❌ reset at npmjs.com/settings/capitalthought/account
  1Password token:    sha256:abc… (last rotated 2 hr)    ✅
  GH secret NPM_TOKEN: set, updated 2 hr ago              ✅
  Vercel mirror:      not configured                     —

Recommendation: rotate to granular+bypass token (/npm-rotate-token),
reset the npm password (human-in-browser), then re-run /npm-publish.
```

## Rules

- Every row has one of four states: ✅ ok · ⚠ drift but publishable · ❌ blocks publish · — not configured.
- Never output noise — if everything is green, say "no drift" and stop.
- Don't recommend commands that won't help. If password is stale, rotating the token won't unblock token-creation flows.
