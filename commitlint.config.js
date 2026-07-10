export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['cli', 'core', 'graph', 'hooks', 'events', 'plugins', 'approval', 'tests', 'ci', 'docs'],
    ],
  },
}
