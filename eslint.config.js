import tsparser from "@typescript-eslint/parser";

export default [
  { ignores: ["node_modules/**", "dist/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      sourceType: "module",
    },
    rules: {},
  },
];
