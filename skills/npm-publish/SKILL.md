---
name: npm-publish
description: One-shot npm publish — detects package, syncs credentials, bumps version, tags, pushes, tails the workflow, classifies failures, recovers automatically where possible. Use when the user says "publish this", "ship it", "release npm", or similar.
---

# npm-publish

Publish the current package to npm and drive the downstream CI to green without human round-trips.

## Happy path

1. **Detect the package.** Read `package.json` at the repo root. If there's a `packages/` dir or workspaces field, ask which package (unless only one).
2. **Read plugin state.** `~/.config/npm-helper/state.json` has per-package config: 1P item ID, GH secret name, workflow path, Vercel projects. If missing, run `/npm-register <pkg>` first.
3. **Reconcile credentials.**
   - Read the npm token from 1Password (`op item get <id> --fields token --reveal`).
   - Compute `sha256(token)`. Compare to the fingerprint in state. If drift, push to the GH secret (`gh secret set NPM_TOKEN -R <repo>`) and any Vercel projects in state.
   - Do NOT touch the password — that's a source of truth handled by `/npm-doctor`.
4. **Bump version.** `npm version <patch|minor|major>` — the user said which. If they didn't, default to patch. Creates a commit + local tag.
5. **Push.** `git push --follow-tags`. This fires the publish workflow.
6. **Tail the workflow.** Poll `gh run list --workflow=<wf> --limit 1` with backoff (2s, 5s, 10s, cap 30s, max 10 polls). When complete:
   - success → update `CHANGELOG.md` if present, write state, done.
   - failure → hand off to `/npm-unstick`.

## Failure handling

Every npm error flows through the MCP `npm.classify_error` tool. Do NOT interpret errors yourself — the classifier owns the decision tree. Paste stderr into it and follow the `action` it returns:

| action | what to do |
|---|---|
| `flip-2fa-auth-only` | call `/npm-set-2fa auth-only` |
| `rotate-granular-token` | call `/npm-rotate-token` |
| `reset-password` | call `/npm-doctor` — password drift |
| `retry` | wait N seconds (from classifier) then retry |
| `fix-publishconfig` | patch `package.json`, commit, retry |
| `human-in-browser <url>` | pause, show URL, ask user to confirm when done |

## Rules

- Never guess at npm errors. Always use `npm.classify_error`.
- Never write a password back to 1P — only tokens and recovery codes.
- Don't bump version until credentials are reconciled. A failed publish with a committed `npm version` bump is a sticky mess.
- If the user hasn't run `/npm-register <pkg>` yet, stop and ask. Running blind with no state file is worse than a 30-second setup.
