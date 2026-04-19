---
name: npm-set-2fa
description: Change the npm account 2FA level between disabled, auth-only, and auth-and-writes. Use when /npm-doctor reports account 2FA is blocking automation tokens.
---

# npm-set-2fa

Flip the npm account's 2FA level. Requires a security-key tap OR a recovery code.

## Usage

```
/npm-set-2fa auth-only        # recommended for automation — tokens publish without OTP
/npm-set-2fa auth-and-writes  # most secure, but classic automation tokens hit EOTP
/npm-set-2fa disabled         # no 2FA at all — not recommended unless publishing requires it
```

## Flow

1. **CLI path first.** `npm profile enable-2fa <level>` (or `disable-2fa`).
   - Prompts for password → pull from 1P.
   - Prompts for OTP → if the account uses WebAuthn only, there's no TOTP. Fall back to a recovery code from `op item get <id> --fields recovery_codes --reveal`.
   - If neither works → UI path.
2. **UI path.** Open `https://www.npmjs.com/settings/<user>/profile` and tell the user exactly which option to click. Wait for confirmation.
3. **Verify.** `npm profile get | grep two-factor` — confirm the new level took effect.
4. **Persist.** Update state with `two_factor_level` field. If recovery codes were used, prompt the user to regenerate + save fresh ones to 1P (codes are single-use).

## Rules

- Never print password or recovery codes to stdout. Feed them directly to `npm` via stdin/flags.
- Recovery codes are one-shot. After using one, drop it from 1P immediately.
- If the user is flipping to `disabled`, double-confirm — this materially weakens account security.
