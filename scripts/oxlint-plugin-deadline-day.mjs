/**
 * Local oxlint JS plugin: the one ESLint core rule this repository relied on
 * that oxlint does not ship natively, `no-restricted-syntax`.
 *
 * oxlint's JS plugin API accepts ESLint-style selector keys in a visitor, so
 * each configured `{ selector, message }` pair becomes a visitor entry that
 * reports its message. Options have the same shape as ESLint's rule options,
 * which keeps the selector lists in oxlint.config.ts readable as before.
 *
 * tests/scripts/oxlint-guards.test.ts runs oxlint against
 * fixtures and fails if any guard stops reporting, so a change in oxlint's
 * selector support cannot silently switch these rules off.
 */

/** @typedef {{ selector: string, message: string }} RestrictedSyntaxOption */

const restrictedSyntax = {
  meta: {
    type: "problem",
    docs: { description: "Disallow syntax matched by the configured selectors." },
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          selector: { type: "string" },
          message: { type: "string" },
        },
        required: ["selector", "message"],
        additionalProperties: false,
      },
    },
  },
  create(context) {
    /** @type {RestrictedSyntaxOption[]} */
    const options = context.options;
    /** @type {Map<string, string[]>} */
    const messagesBySelector = new Map();
    for (const { selector, message } of options) {
      messagesBySelector.set(selector, [...(messagesBySelector.get(selector) ?? []), message]);
    }
    return Object.fromEntries(
      [...messagesBySelector].map(([selector, messages]) => [
        selector,
        (node) => {
          for (const message of messages) context.report({ node, message });
        },
      ])
    );
  },
};

export default {
  meta: { name: "deadline-day" },
  rules: { "restricted-syntax": restrictedSyntax },
};
