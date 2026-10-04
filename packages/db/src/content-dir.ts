import { fileURLToPath } from "node:url";

/**
 * Absolute path of packages/db/content (the help, FAQ, blog, changelog and legal Markdown).
 *
 * It is worked out from THIS file's own location, so it is right in both places the code
 * runs: from src/ in development (src/../content) and from the built dist/ in production
 * (dist/../content). Not exported from index.ts: the CommonJS build has no import.meta.url.
 */
export const CONTENT_DIR = fileURLToPath(new URL("../content", import.meta.url));
