# Backstage JWT Token Expiry — Default Values & Configuration

Separate from the full auth flow (`BACKSTAGE_AUTH_FLOW.md`). Covers only token lifetime defaults, where they are set in source code, and how to override them.

---

## Two Token Types — Different Defaults

| Token | Purpose | Default Expiry | Configurable |
|---|---|---|---|
| **User JWT** | Issued after Microsoft login; used by browser for Backstage API calls | **3600s (1 hour)** | Yes |
| **Plugin-to-plugin JWT** | Service-to-service auth between backend plugins | **3600s (1 hour)** | No (hardcoded) |

---

## User JWT Expiry

### Source location

`plugins/auth-backend/src/service/readTokenExpiration.ts`

```ts
const TOKEN_EXP_DEFAULT_S = 3600;   // 1 hour
const TOKEN_EXP_MIN_S     = 600;    // 10 min floor  (clamped, cannot go below)
const TOKEN_EXP_MAX_S     = 86400;  // 24 hour ceiling (clamped, cannot exceed)
```

### Where expiry is stamped into the token

`plugins/auth-backend/src/identity/issueUserToken.ts`

```ts
const iat = Math.floor(Date.now() / MS_IN_S);
const exp = iat + keyDurationSeconds;   // ← expiry baked here
```

### Call chain after Microsoft OAuth callback

```
Microsoft OAuth callback
  → Microsoft provider sign-in resolver runs
  → resolves user entity ref + builds claims (sub, ent, ...)
  → TokenFactory.issueToken()
  → issueUserToken({ keyDurationSeconds, ... })
  → exp = iat + keyDurationSeconds
  → SignJWT(...).sign(key)
  → Backstage user JWT returned to browser
```

### How to override

```yaml
# app-config.yaml
auth:
  backstageTokenExpiration:
    hours: 8        # examples: minutes: 30 / hours: 1 / hours: 24
                    # clamped to [600s, 86400s] regardless of what you set
```

---

## Plugin-to-Plugin JWT Expiry

### Source location

`packages/backend-defaults/src/entrypoints/auth/authServiceFactory.ts`

```ts
const keyDuration = { hours: 1 };   // hardcoded, no config key
```

### Where expiry is stamped into the token

`packages/backend-defaults/src/entrypoints/auth/plugin/PluginTokenHandler.ts`

```ts
const iat = Math.floor(Date.now() / SECONDS_IN_MS);
const ourExp = iat + this.keyDurationSeconds;   // always 3600s
const exp = onBehalfOf
  ? Math.min(ourExp, Math.floor(onBehalfOf.expiresAt.getTime() / SECONDS_IN_MS))
  : ourExp;
```

> When a plugin acts **on behalf of a user** (`onBehalfOf`), the plugin token expiry is capped at whichever is sooner: its own 1-hour window OR the user token's remaining lifetime.

---

## Quick Reference

| Scenario | Expiry |
|---|---|
| User logs in via Microsoft | 1 hour (configurable via `auth.backstageTokenExpiration`) |
| Plugin calls another plugin | 1 hour (hardcoded) |
| Plugin calls another plugin on behalf of user | min(1h, user token remaining lifetime) |
| Minimum user token lifetime | 10 minutes (600s floor) |
| Maximum user token lifetime | 24 hours (86400s ceiling) |
