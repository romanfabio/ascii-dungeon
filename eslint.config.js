import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src-tauri', 'android'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // core/ and gen/ must be pure and deterministic: all randomness goes through Rng.
    files: ['src/core/**/*.ts', 'src/gen/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the injected Rng.' },
        { object: 'Date', property: 'now', message: 'core/gen must be deterministic.' },
        { object: 'performance', property: 'now', message: 'core/gen must be deterministic.' },
        { object: 'crypto', property: 'getRandomValues', message: 'Use the injected Rng.' },
      ],
    },
  },
);
