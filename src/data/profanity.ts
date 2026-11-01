/**
 * Manager-name profanity filter. A product policy, not a security boundary -
 * the game never publishes the manager's name anywhere, it only ever renders
 * it back to the player who typed it. This exists solely to keep an
 * obviously crude name off the player's own screen.
 *
 * Exact list fixed on 2026-09-11. Matching in
 * `src/logic/manager-identity.ts` lowercases, strips diacritics and requires
 * a WHOLE token match, so "Kurwanowski", "Szczepan" and "Kutschera" all pass
 * while "Kurwa" and "Jan-Kurwa" do not.
 */
export const MANAGER_PROFANITY_TOKENS = ["chuj", "jebac", "kurwa", "pizda", "skurwysyn"] as const;
