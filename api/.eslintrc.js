module.exports = {
  extends: 'airbnb-base',
  parser: 'babel-eslint',
  plugins: ['babel'],
  rules: {
    'import/prefer-default-export': 0,
    'no-plusplus': 0,
    'no-underscore-dangle': 0,
    'no-mixed-operators': 0,
    'no-prototype-builtins': 0,
    'no-continue': 0,
    'no-param-reassign': ['error', { props: false }],
    'import/no-extraneous-dependencies': 0,
    'class-methods-use-this': 0,
    'no-unused-expressions': 'off',
    'babel/no-unused-expressions': 'error',
    'no-bitwise': 0,
    'no-loop-func': 0,
  },
  globals: {
    window: true,
    document: true,
  },
};
