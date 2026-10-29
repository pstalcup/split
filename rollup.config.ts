import alias from "@rollup/plugin-alias";
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import path from "path";
import type { RollupOptions } from "rollup";

const watch = process.argv.includes("--watch") || process.argv.includes("-w");

// The vendored scripts are imported from source; these match the paths in tsconfig.json
const vendor = (...parts: string[]) => path.resolve(import.meta.dirname, "vendor", ...parts);

const baseSettings = {
  output: {
    dir: "dist/scripts/split",
    format: "cjs",
    exports: "auto",
    chunkFileNames: "_[name].js",
  },

  external: ["kolmafia"],

  plugins: [
    alias({
      entries: [
        { find: /^loopstar\/(.*)$/, replacement: `${vendor("loopstar", "src")}/$1` },
        {
          find: /^garbo\/(.*)$/,
          replacement: `${vendor("garbage-collector", "packages", "garbo", "src")}/$1`,
        },
        {
          find: /^garbo-lib$/,
          replacement: vendor("garbage-collector", "packages", "garbo-lib", "src", "index.ts"),
        },
      ],
    }),

    replace({
      preventAssignment: true,
      values: {
        "process.env.GITHUB_SHA": JSON.stringify(process.env.GITHUB_SHA ?? "CustomBuild"),
        "process.env.GITHUB_REF_NAME": JSON.stringify(process.env.GITHUB_REF_NAME ?? "CustomBuild"),
        "process.env.GITHUB_REPOSITORY": JSON.stringify(
          process.env.GITHUB_REPOSITORY ?? "CustomBuild",
        ),
      },
    }),

    resolve({
      extensions: [".js", ".ts"],
    }),

    commonjs(),

    babel({
      babelHelpers: "bundled",
      extensions: [".js", ".ts"],
      babelrc: false,
      presets: [
        [
          "@babel/preset-env",
          {
            targets: {
              rhino: "1.8.0",
            },
          },
        ],
        "@babel/preset-typescript",
      ],
    }),
  ],

  watch: watch
    ? {
        clearScreen: false,
      }
    : undefined,
} satisfies RollupOptions;

// Each script is a separate build: KoLmafia loads every script on its own
export default [{ split: "src/main.ts" }, { split_choice: "src/standalone/split_choice.ts" }].map(
  (input) => ({
    input,
    ...baseSettings,
  }),
);
