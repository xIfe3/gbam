import base from "@gbam/config/eslint";

export default [
  ...base,
  {
    // Nest DI reads constructor param types at runtime (emitDecoratorMetadata). Without this,
    // consistent-type-imports would "fix" injected classes into `import type` and break DI.
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
  },
];
