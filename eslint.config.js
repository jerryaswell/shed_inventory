import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Rules that catch a mistake, not rules that express a preference, the same
 * narrow set as self_mgmt's. CI runs this with --max-warnings=0.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'backend/dist/**', 'backend/node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    rules: {
      'no-unused-vars': [
        'error',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'require-atomic-updates': 'error'
    }
  },
  {
    files: ['site/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']:not(:has(JSXAttribute[name.name='type']))",
          message: 'Give every <button> a type: type="button" unless it submits a form.'
        }
      ]
    }
  },
  {
    files: ['backend/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node
    }
  }
];
