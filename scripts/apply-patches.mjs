/* eslint-env node */
// Apply patches/<submodule>/*.patch to vendor/<submodule>. Already-applied
// patches are skipped, so this is safe to run before every build.
import { spawnSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";

function git(cwd, args) {
  return spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

let failed = false;
for (const submodule of readdirSync("patches")) {
  const vendorDir = join("vendor", submodule);
  if (!existsSync(vendorDir)) {
    console.error(`${vendorDir} is missing. Run \`git submodule update --init\`.`);
    process.exit(1);
  }
  for (const patch of readdirSync(join("patches", submodule)).filter((f) => f.endsWith(".patch"))) {
    const patchPath = resolve("patches", submodule, patch);
    if (git(vendorDir, ["apply", "--reverse", "--check", patchPath]).status === 0) continue;
    const result = git(vendorDir, ["apply", patchPath]);
    if (result.status === 0) {
      console.log(`Applied ${submodule}/${patch}`);
    } else {
      console.error(`Failed to apply ${submodule}/${patch}:\n${result.stderr}`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
