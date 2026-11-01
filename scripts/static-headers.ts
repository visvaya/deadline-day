/**
 * Reads the `/*` rule of a Cloudflare static-assets `_headers` file: the headers the host sends with every
 * response. `pnpm preview` serves them too (vite.config.ts), so the browser tests run under the production
 * content security policy. Rules for narrower paths (caching) are left to the host.
 */
export const allPathHeaders = (text: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  let inAllPathRule = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      inAllPathRule = line.trim() === "/*";
    } else if (inAllPathRule) {
      const colon = line.indexOf(":");
      if (colon < 0) throw new Error(`_headers: no colon in header line "${line.trim()}"`);
      headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return headers;
};
