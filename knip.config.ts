/** Knip: unused files, exports and dependencies (rules as in Forma). */
export default {
  entry: ['index.html', '*.config.{ts,mjs}', 'scripts/*.mjs'],
  project: ['src/**/*.ts', 'scripts/*.mjs'],
  rules: {
    exports: 'warn',
    types: 'off',
    dependencies: 'error',
    unlisted: 'error'
  }
};
