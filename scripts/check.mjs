/* eslint-env node */
// Typecheck split's sources. The vendored loopstar sources are checked too
// (they are imported), but upstream does not typecheck cleanly, so only errors
// in src/ fail the check.
import { spawnSync } from "child_process";

const result = spawnSync("npx", ["tsc", "-p", ".", "--pretty", "false"], { encoding: "utf8" });
const lines = (result.stdout + result.stderr).split("\n").filter((l) => l.includes("error TS"));
const ours = lines.filter((l) => l.startsWith("src/"));
const vendored = lines.length - ours.length;

for (const line of ours) console.log(line);
if (vendored > 0) console.log(`(ignored ${vendored} error(s) in vendored sources)`);
process.exit(ours.length > 0 ? 1 : 0);
