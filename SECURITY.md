# Security policy

## Supported versions

Only the current `main` branch and the deployed game built from it are supported.

## Reporting a vulnerability

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a
vulnerability**. Do not open a public issue for it. Include what you found, how to reproduce it and
which commit you tested.

This is a spare-time project, so replies come as time allows. Fixes are merged into the default
branch and deployed, and the report is credited unless you ask otherwise.

## Scope

The game runs entirely in the browser. It has no server of its own beyond the static site, no
accounts and no analytics, and talks to nothing but that site. Careers in progress, finished
careers and settings are stored only in the player's own browser (`localStorage`).

In scope:

- reading stored data back (`src/ui/game-save.ts`, `src/ui/game-archive.ts` and
  `src/ui/local-storage.ts`), for example script injection through a crafted save;
- the build, the CI workflows and the dependencies that reach the shipped bundle;
- the published site itself, including its response headers and content security policy.

Out of scope: anything that requires the player to modify their own browser storage to cheat in
their own game.
