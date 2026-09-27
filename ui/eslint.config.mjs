import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const compat = new FlatCompat({ baseDirectory: dirname });

export default [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [".next/**", ".next-dev/**", "node_modules/**", "public/**"],
  },
];
