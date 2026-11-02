# Deadline Day

A browser game about the sporting director of a Polish Ekstraklasa club. One
career takes 8 to 12 minutes: five seasons of transfer windows, each decision a
single offer card, followed by an epilogue that plays out the squad you leave
behind. No backend, no accounts, mobile first. The game itself is in Polish.

The heart of the game is a hidden ceiling: every player has a potential you
never see directly, only through noisy staff reports, until the legacy screen
at the end.

## Status

In active development. Play the development preview at
<https://deadline-day.visvaya.workers.dev>, deployed from `main` after the full
gate; saves may be lost between versions. The version has one source,
`CURRENT_VERSION` in `src/data/changelog.ts` (`0.35`, or `0.35.1` for a fix),
mirrored as semver in `package.json` (`0.35.0`) and in git tags (`v0.35.0`,
`v0.35.1`); a
test keeps them equal. Every pull request that changes the game moves it by the
step its title names (`pnpm version:bump`, checked in CI), and each verified
deployment of a new version creates its git tag and a GitHub release with the
notes of that changelog entry.

## Stack

TypeScript (strict) across the whole of `src/`, React 19, Vite 8, pnpm. Vitest
for unit tests and a headless golden master, Playwright (Chromium and WebKit)
with axe for end-to-end and accessibility checks.

## Getting started

Requires Node.js 26 and pnpm 12 (pinned in `packageManager`). pnpm 12 ships as a native binary: a global pnpm older than 12 may download it but fail to start it on Windows, so update the global one first (`pnpm self-update`).

```sh
pnpm install     # also activates the git hooks
pnpm dev         # local dev server
pnpm verify      # the full gate: lint, format, text rules, typecheck, tests with coverage, quality checks
pnpm test:e2e    # Playwright on the built bundle; needs `pnpm exec playwright install chromium webkit`
pnpm build       # production bundle into dist/
```

`pnpm balance` runs the headless balance simulator; see `docs/decisions/commands.md` for its
flags and for the measurement scripts.

## Layout

```
src/data/    balance constants, clubs, name pools, domain types
src/logic/   pure simulation functions with no React import; seeded RNG only
src/ui/      React screens and components
tests/       unit, golden master (tests/golden), DOM parity (tests/ui), e2e
scripts/     balance simulator, audits, data parsers, git hooks
docs/        technical notes (mostly in Polish)
```

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) explains how to propose a change.
- [SECURITY.md](SECURITY.md) explains how to report a vulnerability.
- `docs/decisions/` holds technical notes behind the measurements, data
  sources and conventions (mostly in Polish).

## Contributing

Commits follow Conventional Commits in English and are checked by commitlint.
The pre-commit hook runs lint, format and text checks; CI runs `pnpm verify`,
a dependency audit, a bundle-size budget and the e2e suite on every pull
request.

## Licence

Copyright (C) 2026 visvaya

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, version 3. See [LICENSE](LICENSE).

The Figtree font shipped with the game is licensed under the SIL Open Font
License 1.1; its licence is served with the game as
[`public/licenses/figtree-OFL.txt`](public/licenses/figtree-OFL.txt).

Club names and colours belong to their respective owners and are used
for identification only. Player names are generated and do not refer to real
people.
