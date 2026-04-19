# npm-helper

Claude Code plugin that automates away the npm auth / publish friction. Kills the "paste this token, now click that, now retry, now hit EOTP, now stale-password 401, now rotate the token" loop.

## Why

Publishing a package to npm with account 2FA can cascade into 20+ round-trips between the terminal, 1Password, `gh`, and the npmjs.com web UI. Every error message points at a different recovery action, and the decision tree is easy to lose mid-session. This plugin owns that decision tree in one place.

## Install

### As a Claude Code plugin

```bash
cd ~/.claude/plugins    # or wherever your plugin root is
git clone https://github.com/capitalthought/npm-helper
```

Add the MCP server to `~/.claude.json`:

```json
{
  "mcpServers": {
    "npm-helper": {
      "command": "node",
      "args": ["/absolute/path/to/npm-helper/mcp-server/dist/index.js"]
    }
  }
}
```

Build the MCP server:

```bash
cd npm-helper/mcp-server
npm install
npm run build
```

## Usage

| Slash command | What it does |
|---|---|
| `/npm-register` | One-time setup per package — writes `state.json` (1P item, GH repo, publish workflow, secret, Vercel mirrors). |
| `/npm-publish` | One-shot publish: reconcile creds, bump version, tag, push, tail workflow, recover on failure. |
| `/npm-doctor` | Read-only diagnosis. Reports npm ↔ 1Password ↔ GH Actions drift. |
| `/npm-rotate-token` | Mint a fresh granular+bypass-2fa token. Updates 1P + GH secret. Revokes the old one. |
| `/npm-set-2fa` | Change account 2FA level (disabled / auth-only / auth-and-writes). |
| `/npm-unstick` | Called automatically by the PostToolUse hook on failed publish. Classifies, recovers, retries once. |

## State

Config lives at `~/.config/npm-helper/state.json`. No secrets — only 1P item IDs, GH secret names, and token SHA-256 fingerprints.

See [`config/state.example.json`](config/state.example.json) for the schema.

## How it stays consistent

The classifier (`mcp-server/src/tools/classify.ts`) is the single source of truth for (npm error → recovery action). Slash commands never interpret npm errors themselves — they always call `npm_classify_error` and follow the `action` field. This is why the same failure produces the same recovery every time, instead of the model re-inventing the decision tree mid-session.

Adding a new error pattern? Drop a fixture in `mcp-server/src/tools/__fixtures__/<name>.txt` and a test case in `classify.test.ts`.

## Human-in-browser, explicit

The plugin automates everything it safely can and prompts exactly once when it can't:

- **WebAuthn security-key tap** — no way around physical interaction.
- **Cloudflare Turnstile** on npmjs.com — never automated.
- **Password reset email link** — opens the mail client; user clicks.
- **Granular token with "Bypass 2FA" checkbox** — if CLI path fails (stale password), opens the UI with query params pre-filled.

Everything else (npm CLI reads, `gh secret set`, `op` reads + writes, workflow dispatch + tail) is fully automated.

## Requirements

- Node 20+
- `npm`, `gh`, `op` (1Password CLI) on `PATH`
- Claude Code 2.x with plugin support

## License

MIT
