import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // These React Compiler-oriented rules flag standard, valid patterns
      // (fetch-on-mount, mounted flags, ref values in context) that this
      // project relies on; the app does not opt into the React Compiler.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // The `const { secret, ...rest } = obj` idiom (drop a field before
      // sending a response) always leaves the destructured field unused.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "server.js",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
