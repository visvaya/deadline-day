export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    // subject-case is left off (also off by default in config-conventional):
    // it classifies the whole subject as one case, so any mention of a
    // file name or a proper noun blocks it. Lowercase-first-word stays a
    // written convention, not a hook.
  },
};
