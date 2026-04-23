module.exports = {
  root: true,
  parserOptions: {
    sourceType: "module",
    project: ["tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
  extends: ["eslint-config-bhdouglass"],
  env: {
    browser: false,
    node: true,
    mocha: true,
  },
  rules: {
    "no-console": ["error", { allow: ["error", "log"] }],
    "no-param-reassign": 0,
    semi: ["error", "always"],
    "brace-style": ["error", "stroustrup", { allowSingleLine: true }],
    "space-before-function-paren": [
      "error",
      {
        anonymous: "always",
        named: "never",
        asyncArrow: "always",
      },
    ],
    "comma-dangle": ["error", "always-multiline"],
    "explicit-function-return-type": "off",
    "strict-boolean-expressions": "off",
    "promise-function-async": "off",
    "consistent-type-definitions": "off",
    "no-non-null-assertion": "off",
    "n/no-callback-literal": "off",
  },
  overrides: [
    {
      files: "test/**/*.ts",
      rules: {
        "@typescript-eslint/no-floating-promises": "off",
      },
    },
  ],
};
