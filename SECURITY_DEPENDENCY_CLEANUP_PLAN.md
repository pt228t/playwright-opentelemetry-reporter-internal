# Security And Dependency Cleanup Plan

## Summary

This plan covers dependency vulnerability cleanup, Node engine policy, and security documentation updates for the internal Playwright OpenTelemetry reporter package.

Baseline audit findings before cleanup:

- Full `npm audit`: 35 advisories total.
- Severity split: 2 critical, 11 high, 16 moderate, 6 low.
- Runtime audit with `npm audit --omit=dev`: 0 vulnerabilities.
- Main risk area: development, CI, documentation, coverage, and local tooling dependencies.
- Published/runtime package risk is currently low because the runtime dependency set is small.

Current status after cleanup, verified on 2026-05-26:

- Active local runtime: Node `v24.16.0`, npm `11.13.0`.
- Full `npm audit`: 0 vulnerabilities.
- Runtime audit with `npm audit --omit=dev`: 0 vulnerabilities.
- Build, lint, formatting, unit tests, and docs generation pass.
- Runtime dependency set remains small; `@opentelemetry/api` is still the only production dependency.

## Node Support Decision

The internal package should support Node 22 and Node 24 only.

Implemented `package.json` engine:

```json
{
  "engines": {
    "node": ">=22 <23 || >=24 <25"
  }
}
```

This intentionally drops old Node support because security fixes in current tooling depend on a modern runtime baseline.

Local machine update:

- Installed Homebrew `node@24`.
- Linked `node@24` as the active Homebrew `node`.
- Replaced the previously active Homebrew Node 25 link because it was outside the package engine range and produced engine warnings.

## Dependency Cleanup Strategy

Completed cleanup slices:

1. Updated the Node engine policy to Node 22 or Node 24.
2. Upgraded Playwright to `@playwright/test@^1.60.0`.
3. Upgraded OpenTelemetry local/dev packages as one aligned set at `^0.218.0`.
4. Removed unused `cspell`.
5. Upgraded AVA and TypeScript test support to `ava@^8.0.1` and `@ava/typescript@^7.0.0`.
6. Upgraded TypeScript lint tooling to `@typescript-eslint/*@^8.60.0`.
7. Upgraded docs tooling to `typedoc@^0.28.19`.
8. Kept Prettier on `^2.8.8` to avoid unrelated repo-wide formatting churn.
9. Used `npm audit fix` for safe transitive dependency updates after direct dependency upgrades.

Important dependency areas now:

- `@playwright/test`: upgraded to a secure maintained version.
- `@opentelemetry/*`: SDK/exporter packages are aligned.
- `ava`: still required by `test:unit`, `watch:test`, the `ava` config block, and existing `src/**/*.spec.ts` tests.
- `codecov`, `standard-version`, commitizen tooling, `nyc`, `@istanbuljs/nyc-config-typescript`, and `open-cli`: not present in the current manifest.
- Dependency `overrides`: not needed after the direct upgrades and safe audit fix.

Compatibility updates made during cleanup:

- Removed obsolete `prettier/@typescript-eslint` from `.eslintrc.json` because modern `eslint-config-prettier` no longer provides that preset.
- Updated Typedoc scripts to remove obsolete `--target` and `--mode` flags.
- Replaced the fragile `@opentelemetry/semantic-conventions/incubating` subpath import with package-local semantic attribute constants while preserving the emitted telemetry attribute keys.
- Updated Playwright test mocks for newer `FullConfig` and `TestStep` fields.

## Source Security Review Notes

Current source scan found no obvious dangerous reporter-core patterns:

- No `eval`.
- No `new Function`.
- No shell execution.
- No arbitrary file writes.
- No embedded HTTP server.
- No HTML injection.

Existing configurable external values are limited to OTLP endpoint environment variables in local setup files:

- `global-setup.ts`
- `scripts/verify-local-otel.js`

Custom Playwright annotations, metric attributes, and trace attributes should remain telemetry data only. They should not be parsed as code, passed to shell commands, or used as file paths.

Dependency cleanup preserved this rule. The semantic attribute constant change only avoids a package subpath resolution issue; it does not change telemetry behavior.

## README And Docs Update Plan

Completed docs updates:

- `README.md` includes runtime and dependency-security guidance.
- `QUICK_START_LOCAL_OTEL.md` mentions Node 22 or Node 24 prerequisites.
- Generated docs build with current Typedoc after script updates.

Recommended verification commands for future cleanup:

```sh
npm install
npm audit --omit=dev
npm audit
npm run build
npm run test:unit
npm run test:lint
npm run test:prettier
npm run playwright -- --project=chromium
npm run otel:verify
```

Latest verified commands:

```sh
node -v
npm -v
npm audit --omit=dev
npm audit
npm run build
npm run test:unit
npm run test:lint
npm run test:prettier
npm run doc
npm run doc:json
```

Latest verification results:

- `node -v`: `v24.16.0`.
- `npm -v`: `11.13.0`.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm audit`: 0 vulnerabilities.
- `npm run build`: passed.
- `npm run test:unit`: 31 tests passed.
- `npm run test:lint`: passed.
- `npm run test:prettier`: passed.
- `npm run doc`: passed with one Typedoc warning about `TraceAttributes` not being included in generated docs.
- `npm run doc:json`: passed with the same Typedoc warning.

## Acceptance Criteria

- `npm audit --omit=dev` remains clean: complete.
- Full `npm audit` has no critical or high advisories: complete.
- Full `npm audit` has zero advisories: complete.
- Build passes: complete.
- Unit tests pass: complete.
- Lint and formatting checks pass: complete.
- Docs generation passes: complete.
- Chromium e2e tests pass: still pending re-verification.
- Local OTLP verification passes: still pending re-verification with a collector or test receiver running.
- Reporter public API and telemetry behavior remain unchanged: expected; unit tests pass and telemetry attribute keys were preserved.

## Remaining Work

- Re-run `npm run playwright -- --project=chromium` outside restrictive browser-launch sandbox conditions.
- Re-run `npm run otel:verify` with the local OTLP collector or test receiver running.
- Decide later whether to migrate away from AVA. Do not remove AVA before migrating the existing unit tests.

## Assumptions

- This work applies to `playwright-opentelemetry-reporter-internal`.
- GitLab is the target CI/publishing environment.
- Node 22 and Node 24 are acceptable internal runtime baselines.
- Dependency upgrades should preserve existing reporter behavior.
- Package publishing and GitLab release automation can be handled separately after dependency cleanup.
