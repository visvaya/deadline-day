import { defineConfig } from "oxlint";

/**
 * Lint configuration (oxlint, migrated from ESLint on 2026-10-21).
 *
 * `no-restricted-syntax` has no native oxlint rule, so the selector guards
 * below run through the local JS plugin in scripts/oxlint-plugin-deadline-day.mjs
 * as `deadline-day/restricted-syntax`. Same options, same selectors.
 */

/** Extracted so the `src/**` override below can add to this list instead of
 * replacing it: an override replaces a rule's options wholesale, so repeating
 * the rule there without these would silently drop the XSS guards in the one
 * tree where they matter most. */
const DOM_XSS_SELECTORS = [
  {
    selector: "AssignmentExpression[left.property.name='innerHTML']",
    message: "Assigning innerHTML risks DOM XSS. Build nodes or use textContent.",
  },
  {
    selector: "AssignmentExpression[left.property.name='outerHTML']",
    message: "Assigning outerHTML risks DOM XSS. Build nodes or use textContent.",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "insertAdjacentHTML risks DOM XSS. Build nodes or use textContent.",
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name='write']",
    message: "document.write risks DOM XSS. Build nodes or use textContent.",
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name='writeln']",
    message: "document.writeln risks DOM XSS. Build nodes or use textContent.",
  },
];

/**
 * No em dash in text the player reads. Product owner's decision, 2026-09-14:
 * use an en dash for a sentence break, or a middle dot where the mark is
 * really a separator between fields.
 *
 * Scoped to `src/**` because that is where player-visible copy lives. It does
 * NOT cover `scripts/**`, whose strings are Polish markdown reports where the
 * em dash is the house style, and it cannot reach comments at all - selectors
 * match AST nodes, and a comment is not one. Both exclusions are intended;
 * `pnpm check:text` covers comments and CSS.
 */
const EM_DASH_MESSAGE =
  "Em dash (—) w tekście gracza. Uzyj pauzy krotkiej (–) albo kropki srodkowej (·).";
const EM_DASH_SELECTORS = [
  { selector: "Literal[value=/—/]", message: EM_DASH_MESSAGE },
  { selector: "TemplateElement[value.raw=/—/]", message: EM_DASH_MESSAGE },
  { selector: "JSXText[value=/—/]", message: EM_DASH_MESSAGE },
];

/**
 * No classes in src/ except Error subclasses and a React error boundary
 * (extends Component). Written as AST selectors rather than a text scan so a
 * comment that merely mentions a CSS "class" cannot trip it.
 */
const CLASS_MESSAGE =
  "Classes are allowed only for Error subclasses and a React error boundary. Use functions and plain data.";
const ALLOWED_SUPERCLASS =
  ":not([superClass.name=/Error$/]):not([superClass.name='Component']):not([superClass.property.name='Component'])";
const CLASS_SELECTORS = [
  { selector: `ClassDeclaration${ALLOWED_SUPERCLASS}`, message: CLASS_MESSAGE },
  { selector: `ClassExpression${ALLOWED_SUPERCLASS}`, message: CLASS_MESSAGE },
];

const NO_MATH_RANDOM: ["error", { object: string; property: string; message: string }] = [
  "error",
  {
    object: "Math",
    property: "random",
    message: "Use the deterministic RNG from src/logic/rng instead of Math.random().",
  },
];

/** Mouse handlers only: see the jsx-a11y override below for why. */
const POINTER_HANDLERS = ["onClick", "onError", "onLoad", "onMouseDown", "onMouseUp"];

const errors = (names: string[]): Record<string, "error"> =>
  Object.fromEntries(names.map((name) => [name, "error"]));
const off = (names: string[]): Record<string, "off"> =>
  Object.fromEntries(names.map((name) => [name, "off"]));
const withOptions = <T>(options: T): ["error", T] => ["error", options];

/*
 * The four presets the ESLint config extended, written out rule by rule.
 * Generated with `@oxlint/migrate` 1.88.0 from the last eslint.config.js and
 * kept explicit on purpose: oxlint's `correctness` category (enabled below on
 * top of these) does not contain every recommended rule - no-empty,
 * no-explicit-any and ban-ts-comment sit in other categories - so relying on
 * the category alone would have dropped rules the ESLint gate enforced.
 * Rules oxlint does not implement were skipped by the tool: no-dupe-args,
 * no-octal, react/jsx-uses-react, react/jsx-uses-vars and the like, which
 * TypeScript, strict-mode modules or the JSX transform already make moot.
 */
const ESLINT_RECOMMENDED = [
  "constructor-super",
  "for-direction",
  "getter-return",
  "no-async-promise-executor",
  "no-case-declarations",
  "no-class-assign",
  "no-compare-neg-zero",
  "no-cond-assign",
  "no-const-assign",
  "no-constant-binary-expression",
  "no-constant-condition",
  "no-control-regex",
  "no-debugger",
  "no-delete-var",
  "no-dupe-class-members",
  "no-dupe-else-if",
  "no-dupe-keys",
  "no-duplicate-case",
  "no-empty",
  "no-empty-character-class",
  "no-empty-pattern",
  "no-empty-static-block",
  "no-ex-assign",
  "no-extra-boolean-cast",
  "no-fallthrough",
  "no-func-assign",
  "no-global-assign",
  "no-import-assign",
  "no-invalid-regexp",
  "no-irregular-whitespace",
  "no-loss-of-precision",
  "no-misleading-character-class",
  "no-new-native-nonconstructor",
  "no-nonoctal-decimal-escape",
  "no-obj-calls",
  "no-prototype-builtins",
  "no-redeclare",
  "no-regex-spaces",
  "no-self-assign",
  "no-setter-return",
  "no-shadow-restricted-names",
  "no-sparse-arrays",
  "no-this-before-super",
  "no-undef",
  "no-unexpected-multiline",
  "no-unreachable",
  "no-unsafe-finally",
  "no-unsafe-negation",
  "no-unsafe-optional-chaining",
  "no-unused-labels",
  "no-unused-private-class-members",
  "no-useless-backreference",
  "no-useless-catch",
  "no-useless-escape",
  "no-with",
  "require-yield",
  "use-isnan",
  "valid-typeof",
];

/** typescript-eslint `recommended`, which also extends `eslint-recommended`. */
const TYPESCRIPT_RECOMMENDED = [
  "no-array-constructor",
  "no-unused-expressions",
  "typescript/ban-ts-comment",
  "typescript/no-duplicate-enum-values",
  "typescript/no-empty-object-type",
  "typescript/no-explicit-any",
  "typescript/no-extra-non-null-assertion",
  "typescript/no-misused-new",
  "typescript/no-namespace",
  "typescript/no-non-null-asserted-optional-chain",
  "typescript/no-require-imports",
  "typescript/no-this-alias",
  "typescript/no-unnecessary-type-constraint",
  "typescript/no-unsafe-declaration-merging",
  "typescript/no-unsafe-function-type",
  "typescript/no-wrapper-object-types",
  "typescript/prefer-as-const",
  "typescript/prefer-namespace-keyword",
  "typescript/triple-slash-reference",
];

/** What `eslint-recommended` switches off in TypeScript files: the compiler checks these. */
const CHECKED_BY_TYPESCRIPT = [
  "constructor-super",
  "getter-return",
  "no-class-assign",
  "no-const-assign",
  "no-dupe-class-members",
  "no-dupe-keys",
  "no-func-assign",
  "no-import-assign",
  "no-new-native-nonconstructor",
  "no-obj-calls",
  "no-redeclare",
  "no-setter-return",
  "no-this-before-super",
  "no-undef",
  "no-unreachable",
  "no-unsafe-negation",
  "no-with",
];

/** React Compiler lint rules that oxlint's `correctness` category enables. */
const REACT_COMPILER_RULES = [
  "react/error-boundaries",
  "react/globals",
  "react/immutability",
  "react/incompatible-library",
  "react/preserve-manual-memoization",
  "react/purity",
  "react/refs",
  "react/set-state-in-render",
  "react/static-components",
  "react/use-memo",
  "react/void-use-memo",
];

/** eslint-plugin-react `recommended`. */
const REACT_RECOMMENDED = [
  "react/display-name",
  "react/jsx-key",
  "react/jsx-no-comment-textnodes",
  "react/jsx-no-duplicate-props",
  "react/jsx-no-target-blank",
  "react/jsx-no-undef",
  "react/no-children-prop",
  "react/no-danger-with-children",
  "react/no-direct-mutation-state",
  "react/no-find-dom-node",
  "react/no-is-mounted",
  "react/no-render-return-value",
  "react/no-string-refs",
  "react/no-unescaped-entities",
  "react/no-unknown-property",
  "react/require-render-return",
];

/** eslint-plugin-jsx-a11y `recommended`, options as the preset sets them. */
const JSX_A11Y_RECOMMENDED = {
  ...errors([
    "jsx-a11y/alt-text",
    "jsx-a11y/anchor-has-content",
    "jsx-a11y/anchor-is-valid",
    "jsx-a11y/aria-activedescendant-has-tabindex",
    "jsx-a11y/aria-props",
    "jsx-a11y/aria-proptypes",
    "jsx-a11y/aria-role",
    "jsx-a11y/aria-unsupported-elements",
    "jsx-a11y/autocomplete-valid",
    "jsx-a11y/click-events-have-key-events",
    "jsx-a11y/heading-has-content",
    "jsx-a11y/html-has-lang",
    "jsx-a11y/iframe-has-title",
    "jsx-a11y/img-redundant-alt",
    "jsx-a11y/label-has-associated-control",
    "jsx-a11y/media-has-caption",
    "jsx-a11y/mouse-events-have-key-events",
    "jsx-a11y/no-access-key",
    "jsx-a11y/no-autofocus",
    "jsx-a11y/no-distracting-elements",
    "jsx-a11y/no-redundant-roles",
    "jsx-a11y/role-has-required-aria-props",
    "jsx-a11y/role-supports-aria-props",
    "jsx-a11y/scope",
    "jsx-a11y/tabindex-no-positive",
  ]),
  "jsx-a11y/interactive-supports-focus": withOptions({
    tabbable: ["button", "checkbox", "link", "searchbox", "spinbutton", "switch", "textbox"],
  }),
  "jsx-a11y/no-interactive-element-to-noninteractive-role": withOptions({
    tr: ["none", "presentation"],
    canvas: ["img"],
  }),
  "jsx-a11y/no-noninteractive-element-to-interactive-role": withOptions({
    ul: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
    ol: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
    li: ["menuitem", "menuitemradio", "menuitemcheckbox", "option", "row", "tab", "treeitem"],
    table: ["grid"],
    td: ["gridcell"],
    fieldset: ["radiogroup", "presentation"],
  }),
};

export default defineConfig({
  plugins: ["eslint", "typescript", "react", "jsx-a11y", "import"],
  jsPlugins: ["./scripts/oxlint-plugin-deadline-day.mjs"],
  // On top of the explicit presets below. Two rules from the category are
  // switched off at the end of `rules` because the ESLint gate deliberately
  // did not run them.
  // `suspicious` since 2026-10-21; its exceptions are commented in `rules`.
  categories: { correctness: "error", suspicious: "error" },
  env: { browser: true, node: true, es2024: true },
  settings: { react: { version: "19.3" } },
  // .worktrees/** holds nested git worktrees of this repo; each one
  // duplicates the retired prototype and would fail on its known, accepted debt. .scratch/ and
  // coverage/ are working files nobody commits, ignored by git only through
  // .git/info/exclude, so without these lines a leftover file fails the lint
  // gate and blocks the pre-commit hook. The formatter ignores them too.
  ignorePatterns: ["node_modules/**", "dist/**", "coverage/**", ".scratch/**", ".worktrees/**"],
  rules: {
    ...errors(ESLINT_RECOMMENDED),
    ...errors(TYPESCRIPT_RECOMMENDED),
    ...errors(REACT_RECOMMENDED),
    // One rule for JS and TS alike. ESLint ran the core rule as a warning on
    // JS and typescript-eslint's as an error on TS; tsc's noUnusedLocals and
    // noUnusedParameters back it up in TypeScript.
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "react/react-in-jsx-scope": "off",
    // From `correctness`, outside what the ESLint gate ran. jsx-a11y's
    // prefer-tag-over-role is not in the plugin's recommended preset and
    // fires on intended role="group"/"status" containers. set-state-in-effect
    // is the one React Compiler rule live code does not pass (three effects
    // that sync state on purpose); the rest of that family passes and stays.
    "jsx-a11y/prefer-tag-over-role": "off",
    "react/set-state-in-effect": "off",
    // From `suspicious`: an extra effect dependency is how this code says
    // "run again when X changes" (reset the eviction dialog on a new card,
    // restart the banner timer on new text, re-place a popover), and every
    // flagged one was that. exhaustive-deps still catches missing ones.
    "react/exhaustive-effect-dependencies": "off",
    // Type-aware (`pnpm lint:types`), from `suspicious`: rejects every `as`
    // on a value that is not provably that type, which is how this code reads
    // parsed saves, JSON fixtures and CSV dumps after checking their shape.
    // 212 findings, none a defect; the boundaries have their own guards.
    "typescript/no-unsafe-type-assertion": "off",
    // Type-aware, from `suspicious`: every flagged function was either an
    // exhaustive switch (TypeScript already proves each branch returns) or a
    // React effect that returns early with nothing and otherwise returns its
    // cleanup, which is the idiom effects are written in.
    "typescript/consistent-return": "off",
    // Side-effect imports are allowed for stylesheets only.
    "import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
    // A <button> without a type submits the form it sits in.
    "react/button-has-type": "error",
    // Scoped to two stable hook rules - the React Compiler family (purity,
    // immutability, refs...) does not fit this code's current style.
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "warn",

    eqeqeq: ["error", "always", { null: "ignore" }],
    "no-var": "error",
    "prefer-const": "error",
    "prefer-template": "error",
    // Enforces the immutable-updates convention.
    "no-param-reassign": ["error", { props: false }],

    // DOM XSS vectors - a real risk even in React (e.g. a hardcoded
    // dangerouslySetInnerHTML), zero cost while unused.
    "react/no-danger": "error",
    "react/jsx-no-script-url": "error",
    "deadline-day/restricted-syntax": ["error", ...DOM_XSS_SELECTORS],
    "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
    // A real risk in this list-heavy UI (squad tiles, league table).
    "react/no-array-index-key": "warn",
    "react/no-unstable-nested-components": ["error", { allowAsProps: true }],

    // A cycle in ESM yields `undefined` at module initialisation - a quiet,
    // plausible wrong value. Replaces madge (`pnpm quality:circular`).
    "import/no-cycle": "error",
  },
  overrides: [
    {
      // typescript-eslint's `eslint-recommended` layer for TypeScript files.
      files: ["**/*.{ts,tsx,mts,cts}"],
      rules: {
        ...off(CHECKED_BY_TYPESCRIPT),
        "prefer-rest-params": "error",
        "prefer-spread": "error",
      },
    },
    {
      // reference/ holds the retired v7 prototype, kept as a dead archive for
      // historical comparison - never imported, never built, never tested.
      files: ["reference/**"],
      rules: {
        "no-unused-vars": "off",
        "no-param-reassign": "off",
        "react/no-unstable-nested-components": "off",
        "react/no-array-index-key": "off",
        "react/button-has-type": "off",
        "no-shadow": "off",
        "no-underscore-dangle": "off",
        // The React Compiler family from `correctness`: live code passes it,
        // the archive was written long before it existed.
        ...off(REACT_COMPILER_RULES),
      },
    },
    {
      // Player-visible copy lives here and nowhere else that ships.
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        // A wrong `!` in the shipped game passes `undefined` on silently; the
        // invariant helpers (`at`, `mapAt`, `defined` in src/logic/invariant.ts)
        // stop with a readable error instead. Tests and scripts may still use
        // `!`: there a wrong one fails loudly where it stands.
        "typescript/no-non-null-assertion": "error",
        "deadline-day/restricted-syntax": [
          "error",
          ...DOM_XSS_SELECTORS,
          ...EM_DASH_SELECTORS,
          ...CLASS_SELECTORS,
        ],
      },
    },
    {
      // Simulation logic must be pure and testable without a DOM. This guards
      // the module graph, which is
      // what keeps `pnpm test` able to run the whole engine without a DOM and
      // the balance simulator a plain script.
      files: ["src/logic/**", "src/data/**", "scripts/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "react",
                message: "Simulation logic must not import React. Keep it pure and DOM-free.",
              },
              {
                name: "react-dom",
                message: "Simulation logic must not import React. Keep it pure and DOM-free.",
              },
            ],
            patterns: [
              {
                group: ["**/ui/**", "../ui", "../../ui"],
                message:
                  "src/logic and src/data must not import from src/ui - the arrow points the other way.",
              },
            ],
          },
        ],
        "no-restricted-globals": [
          "error",
          { name: "window", message: "Logic and data must not depend on the browser." },
          { name: "document", message: "Logic and data must not depend on the DOM." },
        ],
        "no-restricted-properties": NO_MATH_RANDOM,
      },
    },
    {
      // src/data is the leaf of the graph: constants, pools and types that
      // everything else reads and that read nothing back.
      files: ["src/data/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["**/logic/**", "../logic", "./logic"],
                message: "src/data is a leaf: constants and types only, no imports from src/logic.",
              },
            ],
          },
        ],
      },
    },
    {
      // UI and tests go through the same seeded RNG as the simulation. The two
      // test guard helpers call Math.random under narrow inline exemptions.
      files: ["src/ui/**", "tests/**"],
      rules: { "no-restricted-properties": NO_MATH_RANDOM },
    },
    {
      // Importing anything from a test file registers that file's tests in
      // the importer as well. Two files did this until 2026-10-21 and ran
      // game-reducer-offers.test.ts three times per suite. Shared helpers
      // belong in a plain module next to the tests (tests/logic/offer-walk.ts).
      files: ["tests/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["**/*.test", "**/*.test.*", "**/*.spec", "**/*.spec.*"],
                message:
                  "Do not import from a test file: its tests would run again in this one. Move the helper to a plain module.",
              },
            ],
          },
        ],
      },
    },
    {
      // Static half of the accessibility gate; tests/e2e/a11y.spec.ts is the
      // runtime half. They catch different things and neither replaces the
      // other: this one reads JSX and never runs it, so it sees a handler on
      // a div with no role in a branch no test reaches, while axe sees the
      // actual accessibility tree but only where a test walks.
      files: ["src/ui/**/*.tsx"],
      rules: {
        ...JSX_A11Y_RECOMMENDED,
        // Both rules exist to catch one defect: something you can operate
        // with a mouse and not with a keyboard. Their default handler list
        // includes the key handlers, which inverts that - attaching a
        // keyboard handler is the remedy, never the defect. Mouse handlers
        // stay checked, which is the part that finds real traps.
        "jsx-a11y/no-noninteractive-element-interactions": [
          "error",
          { handlers: POINTER_HANDLERS },
        ],
        "jsx-a11y/no-static-element-interactions": ["error", { handlers: POINTER_HANDLERS }],
        // A scrollable region must be reachable by keyboard or it fails WCAG
        // 2.1.1, and reaching it means tabIndex - so the one role this
        // project puts tabIndex on is the one the rule rejects by default.
        "jsx-a11y/no-noninteractive-tabindex": [
          "error",
          { tags: [], roles: ["tabpanel", "region"], allowExpressionValues: true },
        ],
      },
    },
  ],
});
