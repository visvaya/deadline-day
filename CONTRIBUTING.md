# Contributing

Thank you for your interest in Deadline Day. It is a spare-time project with one maintainer, so
replies and reviews come as time allows.

## Before you start

- For a bug, open an issue with what you did, what you saw and what you expected, the browser and
  device, and the version shown on the start screen.
- For anything larger than a small fix, open an issue first and describe the change, so we can
  agree on it before you spend time on code.
- Security problems go through a private report, not an issue: see `SECURITY.md`.

## Setup

Node.js 24 and pnpm 12 (pinned in `packageManager`); see the README for details.

```sh
pnpm install     # dependencies and git hooks
pnpm dev         # local dev server
pnpm verify      # the full gate, the same one CI runs
pnpm test:e2e    # Playwright on the built bundle (Chromium and WebKit)
```

The git hooks run lint, format and text checks before a commit and check the commit message.
Do not bypass them with `--no-verify`; CI runs the same checks and more.

## Making a change

1. Fork the repository and branch from `main`.
2. Write tests with the change: unit tests for logic, DOM tests (`tests/ui`) or browser tests
   (`tests/e2e`) for the interface.
3. Run `pnpm verify` before you open the pull request; CI runs it again together with the e2e suite.

## Pull requests

- Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/)
  in English: `<type>(<scope>): <subject>`, imperative mood, at most 72 characters. Pull requests
  are squash-merged, so the title becomes the commit on `main`.
- `pnpm verify` must pass locally; CI also runs the e2e suite, a dependency audit and a bundle-size
  budget.
- Fill in the pull request template: what changed and why, what you checked and what you did not.
- Only the maintainer merges. A merge into `main` deploys the game, so a pull request from a fork
  waits for the maintainer's review, and its workflows for the maintainer's approval on a first
  contribution.

## Rules the code depends on

These are the invariants a review checks first. Breaking one is a bug even when the tests pass.

- **The hidden ceiling stays hidden.** A player's ceiling (`ceiling`, still `sufit` in older code)
  must not reach the UI before the final screen, neither directly nor through anything derived from
  it: colour, sorting, an arrow, a tooltip or an `aria-label`. The only sanctioned channel is the
  staff report, which shows a noisy estimate.
- **Determinism.** No `Math.random()` outside `src/logic/rng.ts`. Every function that draws a random
  number takes an RNG instance as an argument; the reducer keeps only the serialisable RNG state.
- **Pure logic.** `src/logic` never imports React. State changes are immutable.
- **Balance constants live in `src/data/balance.ts`.** A changed constant goes through the balance
  simulator (`pnpm balance --clubs all`) before it is merged.
- **Golden master.** `tests/golden/` replays recorded careers bit for bit. Traces are never
  regenerated to make a test pass: read the diff and explain every difference in the commit. A change
  to the RNG cascade or to engine behaviour also bumps `ENGINE_REVISION` in
  `src/logic/engine-version.ts`.
- **`data-dd-action` and `data-dd-screen` are a public contract** with the DOM parity and e2e tests.
  New values may be added; existing ones change only together with those tests.
- **Text the player reads is Polish**; code, comments, commits and documentation are English. Older
  code still carries Polish identifiers from the prototype; new code is English throughout. No em
  dash in player-facing text: use an en dash or a middle dot. Amounts are in millions of euros with a
  Polish decimal comma.
- **No real player names.** Names are generated from the pools in `src/data`. Club names and colours
  are used for identification only.
- **Mobile first, 360 px reference width**, no horizontal page scroll, WCAG 2.2 AA (the e2e suite
  runs axe on every screen).

## Licence

By contributing you agree that your contribution is licensed under the
[GNU Affero General Public License v3.0](LICENSE), the licence of this project.
