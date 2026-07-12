import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

const noUnusedVars = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }]

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,

  // Frontend (React, browser)
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // new JSX transform: no React import needed
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off', // intentional partial deps in several hooks
      'react/prop-types': 'off', // this codebase does not use PropTypes
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': noUnusedVars,
    },
  },

  // Backend, tests and tooling (Node)
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'eslint.config.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': noUnusedVars,
    },
  },
]
