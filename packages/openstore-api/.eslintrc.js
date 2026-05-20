module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: ['eslint-config-bhdouglass'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  rules: {
    'no-debugger': process.env.NODE_ENV === 'production' ? 2 : 0,
    'no-console': process.env.NODE_ENV === 'production' ? 1 : 0,

    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/brace-style': ['error', '1tbs'],
    '@typescript-eslint/consistent-indexed-object-style': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/prefer-ts-expect-error': 'off',
    '@typescript-eslint/array-type': 'off',

    '@typescript-eslint/prefer-optional-chain': 'off', // TODO fix these errors
    '@typescript-eslint/prefer-nullish-coalescing': 'off', // TODO fix these errors
  },
  overrides: [
    {
      files: '*.test.ts',
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
  ],
};
module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'module',
    project: ['tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  extends: ['eslint-config-bhdouglass'],
  env: {
    browser: false,
    node: true,
    mocha: true,
  },
  rules: {
    'no-console': ['error', { allow: ['error', 'log'] }],
    'no-param-reassign': 0,
    semi: ['error', 'always'],
    'brace-style': ['error', '1tbs'],
    '@typescript-eslint/brace-style': ['error', '1tbs'],
    'space-before-function-paren': [
      'error',
      {
        anonymous: 'always',
        named: 'never',
        asyncArrow: 'always',
      },
    ],
    'comma-dangle': ['error', 'always-multiline'],
    'explicit-function-return-type': 'off',
    'strict-boolean-expressions': 'off',
    'promise-function-async': 'off',
    'consistent-type-definitions': 'off',
    'no-non-null-assertion': 'off',
    'n/no-callback-literal': 'off',
  },
  overrides: [
    {
      files: 'test/**/*.ts',
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
  ],
};
