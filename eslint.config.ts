import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import libram, { verifyConstantsSinceRevision } from "eslint-plugin-libram";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Refresh the KoLmafia data that libram/verify-constants checks against.
// garbo's code (ported in src/farm/garbo.ts) needs items up to this revision.
const VERIFY_CONSTANTS_SINCE = 29339;
await verifyConstantsSinceRevision(VERIFY_CONSTANTS_SINCE);

export default defineConfig(
  {
    ignores: ["dist"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...libram.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "block-scoped-var": "error",
      "eol-last": "error",
      eqeqeq: "error",
      "no-trailing-spaces": "error",
      "no-var": "error",
      "prefer-arrow-callback": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration:not([const=true])",
          message: "Don't declare non-const enums",
        },
      ],
    },
  },
  prettier,
);
