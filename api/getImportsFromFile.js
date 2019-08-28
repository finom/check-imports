const { builtinModules } = require('module');
const fs = require('fs').promises;
const babelParser = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');

async function getImportsFromFile({ filePath, babelPlugins }) {
  const script = await fs.readFile(filePath, 'utf8');
  const imports = [];

  const parsed = babelParser.parse(script, {
    sourceType: 'module',
    plugins: babelPlugins,
  });

  traverse(parsed, {
    enter({ node }) {
      // handle import
      if (node.type === 'ImportDeclaration') {
        imports.push(node.source.value);
      }

      // handle require() and import()
      if (node.type === 'CallExpression') {
        if (node.callee.name === 'require' || node.callee.type === 'Import') {
          const arg = node.arguments[0];

          if (arg) {
            imports.push(arg.value);
          }
        }
      }
    },
  });

  // replace webpack syntax occurence, filter relative paths
  return imports.map((imp) => imp.replace(/(.*)!/, '').replace(/\?(.*)/, ''))
    .map((imp) => {
      if (imp.startsWith('@')) {
        // handle scoped package names
        return imp.replace(/(@[^/]+\/[^/]+)\/.*/, '$1');
      }
      // handle regular package names
      return imp.replace(/([^/]+)\/.*/, '$1');
    })
    .filter((imp) => !imp.startsWith('.')).filter((imp) => !builtinModules.includes(imp));
}

module.exports = getImportsFromFile;
