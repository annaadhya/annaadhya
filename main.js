/**
 * Repo-root entry launcher for Hostinger's Node.js deploy pipeline.
 *
 * The platform's express/other app types resolve the configured Entry File
 * against the build workspace root, not the configured output directory
 * (proven by round-12 build 01a1c8fb: "ERROR: Entry file not found" although
 * apps/api/dist/main.js exists). This launcher satisfies that resolution
 * basis. The dist is fully self-contained (apps/api/dist/node_modules), so
 * every runtime dependency resolves relative to the required file regardless
 * of the process cwd. Same launcher contract as apps/api/dist/main.js.
 */
require("./apps/api/dist/src/boot.js");
