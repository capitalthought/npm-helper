---
name: npm-register
description: One-time per-package setup — writes an entry in `~/.config/npm-helper/state.json` mapping a package to its 1Password item, GitHub repo, publish workflow, GH secret, and optional Vercel mirrors. Run this once before `/npm-publish` will work on a new package.
---

# npm-register

Interactive setup. All the other skills (`/npm-publish`, `/npm-doctor`, `/npm-rotate-token`, `/npm-set-2fa`) read `state.json` and assume an entry exists. This is the skill that writes it.

## Flow

1. **Resolve the package.**
   - Default: read `./package.json` — `name` is the package.
   - If workspaces (`workspaces` field in root `package.json` or a `packages/` dir), list them and ask which one. Do not guess.
   - Argument form: `/npm-register @scope/pkg` skips the prompt.

2. **Look up the owning npm account.**
   - `npm access get <pkg> --json` → `maintainers[].name`. If the command fails (package isn't published yet), ask the user which account will own it.
   - If there's exactly one maintainer, use it. Otherwise ask.

3. **Check for an existing state entry.**
   - Call `state_load`. If `state.packages[<pkg>]` already exists, print it and ask: **reconfigure** (overwrite), **abort** (keep current), or **fingerprint-only** (just re-read the token and refresh `token_sha256`). Never silently clobber.

4. **Account entry** (`state.accounts[<npm_user>]`). Skip if already present AND the user didn't pick "reconfigure the account too".
   - Prompt for the 1Password item ID holding the npm password + recovery codes. Suggest: `op item list --vault Employee | grep -i npm` — paste the output and let the user pick. Accept either the UUID or the title (resolve title → UUID via `op item get <title> --format json | jq -r .id`).
   - Ask for the `pw_field` (default `password`) and `recovery_codes_field` (default `Recovery Codes.recovery_codes`, or blank if none).
   - **Detect fallback 2FA.** Run `op item get <id> --otp`. Three outcomes:
     - Exit 0 with a 6-digit code → account has TOTP → `fallback_2fa: "totp"`.
     - Exit non-zero with stderr containing `no otp` / `does not have` / `one-time password is not present` → if `recovery_codes_field` is set, `fallback_2fa: "recovery-only"`; else `fallback_2fa: "webauthn"`.
     - Anything else (network error, auth prompt) → ask the user to pick.

5. **Package entry** (`state.packages[<pkg>]`).
   - **Repo.** Default: `gh repo view --json nameWithOwner -q .nameWithOwner` run from the package's directory. Confirm with the user.
   - **Publish workflow.** Call `workflow_find_publish` with the repo root. If exactly one match, use it. If zero, ask the user to create one (offer to stop and let them run `gh workflow new` themselves). If multiple, print the first-match line for each and let the user pick.
   - **GH secret name.** Default `NPM_TOKEN`. Confirm by checking `gh secret list -R <repo>` and showing what's already there. If the default isn't present AND a `NODE_AUTH_TOKEN` / `NPM_AUTH_TOKEN` is, suggest matching it.
   - **Vercel projects.** Default none. If the user names projects, validate each with `vercel projects ls | grep <name>` — but do not block if vercel CLI is missing; just record the names.
   - **Token.** Run `npm token list --json` as the account (after `npm login` if needed). Show the user the list and ask which token corresponds to this package. Options:
     - Pick an existing token → ask the user to paste it once so we can fingerprint. Never store the token itself.
     - Create a new one → offer to hand off to `/npm-rotate-token` immediately. That skill mints + persists; we just return here to verify.
   - Fill `two_factor_level` from `npm_profile_get` → `tfa.mode` (or ask if absent).

6. **Verify before write.**
   - Build a draft entry and run `/npm-doctor` against it in-memory (pass the draft state, don't save yet). If doctor reports any ❌ (blocking), print the report and ask the user to fix OR confirm they want to save a known-broken entry. Default: refuse.
   - If doctor is green OR only ⚠ drift, proceed.

7. **Save + show.**
   - Call `state_save` with the merged state.
   - Print the final JSON entry back to the user (just the two keys that changed — account + package).
   - Suggest next step: `/npm-publish` (usually) or `/npm-rotate-token` (if the token scope needs tightening).

## Rules

- **Never silently overwrite an existing entry.** Reconfigure is explicit.
- **Never store the token itself.** Only its sha256 fingerprint, the npm `token_id`, and `token_last_rotated`.
- **Refuse to write a broken entry** unless the user forces it. A broken entry looks fine until the next publish and wastes a cycle.
- **WebAuthn detection is best-effort.** `op item get --otp` failing is a strong signal there's no TOTP, but the 1P CLI's exit codes / error strings aren't formally documented. If the detection is ambiguous, ask instead of guessing. (If `op` starts returning a structured `has_otp: false`, swap to that.)
- **Don't try to mint tokens in this skill.** Token creation is `/npm-rotate-token`'s job — offer to hand off, don't duplicate the flow.
- **One package per invocation.** If the user has five packages to register, we do this five times. Batching breaks the "verify before save" guarantee.
- **If the classifier gets involved** (e.g. `npm token list` hits EOTP because the account is `auth-and-writes`), feed the stderr to `npm_classify_error` and follow the action — don't interpret it yourself.
