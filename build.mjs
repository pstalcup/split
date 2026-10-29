/* eslint-env node */
import { existsSync } from "fs";
import esbuild from "esbuild";
import babel from "esbuild-plugin-babel";

if (!existsSync("vendor/loopstar/src/main.ts")) {
  console.error(
    "vendor/loopstar is missing. Run `git submodule update --init` (see README.md) before building."
  );
  process.exit(1);
}

const watch = process.argv.some((arg) => ["--watch", "-w"].includes(arg));

const context = await esbuild.context({
  bundle: true,
  minify: false,
  platform: "node",
  target: "rhino1.7.14",
  external: ["kolmafia"],
  // Resolves the "loopstar/*" path alias declared in tsconfig.json
  tsconfig: "tsconfig.json",
  define: {
    "process.env.GITHUB_SHA": `"${process.env?.["GITHUB_SHA"] ?? "CustomBuild"}"`,
    "process.env.GITHUB_REF_NAME": `"${process.env?.["GITHUB_REF_NAME"] ?? "CustomBuild"}"`,
    "process.env.GITHUB_REPOSITORY": `"${process.env?.["GITHUB_REPOSITORY"] ?? "CustomBuild"}"`,
  },
  entryPoints: {
    "KoLmafia/scripts/split/split": "src/main.ts",
    "KoLmafia/scripts/split/split_choice": "src/standalone/split_choice.ts",
  },
  entryNames: "[dir]/[name]",
  outdir: "dist",
  plugins: [babel()],
});

await context.rebuild();

if (watch) {
  await context.watch();
} else {
  context.dispose();
}
