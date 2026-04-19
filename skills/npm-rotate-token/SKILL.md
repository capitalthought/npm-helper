---
name: npm-rotate-token
description: Rotate the npm publish token for a package to a fresh granular+bypass-2fa token, update 1Password and the GitHub Actions secret. Use when publishes hit E403/EOTP and /npm-doctor says the token needs replacing.
---

# npm-rotate-token

Swap the publish token with minimal human interaction.

## Flow

1. **Try CLI path first.** `npm token create --packages @scope/pkg --packages-and-scopes-permission read-write --cidr-whitelist 0.0.0.0/0 --expires 365 --name "npm-helper <date>"` (plus `--bypass-2fa` if supported by current CLI version).
   - Needs password. Pull from 1P. If 401 → skip to UI path.
2. **UI path (fallback).** Open `https://www.npmjs.com/settings/<user>/tokens/granular-access-tokens/new` in the user's default browser. Print the parameters they need to fill:
   - Name: `npm-helper <pkg> <date>`
   - Expires: 365 days
   - Packages and scopes: `<pkg>` (read+write)
   - **"Require 2FA for this token" → unchecked** (or pick "bypass 2FA" — wording varies)
   - Wait for the user to paste the `npm_...` token back.
3. **Persist.**
   - `op item edit <id> 'token[password]=<new-token>'` — updates 1P.
   - `echo -n <new-token> | gh secret set NPM_TOKEN -R <repo>` — updates GH Actions.
   - If state has `vercel_projects`, mirror with `vercel env add` per project.
   - Write `token_id` + `sha256(token)` + timestamp to state.
4. **Revoke the old token.** `npm token revoke <old-id>`. Only after the new one is confirmed written everywhere.

## Rules

- New token scope: **exactly one package**. Per-package tokens blast-radius-limit any leak.
- Never print the token to stdout unredacted. Hand to `op` and `gh` via stdin.
- If the UI path is taken, show the user the URL with query params pre-filled; don't make them navigate a settings tree.
