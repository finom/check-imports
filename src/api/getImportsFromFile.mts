import module from 'module';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import { Project, SyntaxKind } from 'ts-morph';

type GetImportsFromFileOptions = {
  filePath: string;
  throwError?: boolean;
  log?: boolean;
};

const builtinModules = [...module.builtinModules, ...module.builtinModules.map((mod) => `node:${mod}`)];

const parseFileWithTsMorph = async (script: string) => {
  const project = new Project();
  const sourceFile = project.createSourceFile('temp.ts', script);
  return sourceFile;
};

export default async function getImportsFromFile({
  filePath,
  throwError = false,
  log = false,
}: GetImportsFromFileOptions): Promise<string[]> {
  const script = await fs.readFile(filePath, 'utf8');
  const imports: string[] = [];
  let parsed;

  try {
    parsed = await parseFileWithTsMorph(script);
  } catch (e) {
    if (log) {
      console.log(chalk.bgRed(`Unable to parse ${filePath}`));
    }
    if (throwError) {
      throw e;
    }
    return [];
  }

  // Check for ignored lines
  const ignoredLines = parsed.getStatements()
  .filter((statement) => {
    // Get all comments directly within this statement (inline or above)
    const comments = statement.getTrailingCommentRanges()
      .concat(statement.getLeadingCommentRanges());

    // Check if any of these comments match `// check-imports-ignore-line`
    return comments.some((comment) => {
      const commentText = comment.getText().trim();
      return /\/\/.*check-imports-ignore-line*./.test(commentText);
    });
  })
  .map((statement) => statement.getStartLineNumber());
    

  // Traverse AST to extract imports and requires
  parsed.forEachDescendant((node) => {
    const startLine = node.getStartLineNumber();
    if (ignoredLines.includes(startLine)) return;

    // Handle ImportDeclaration
    if (node.getKind() === SyntaxKind.ImportDeclaration) {
      const moduleSpecifier = node.asKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
      if(moduleSpecifier) imports.push(moduleSpecifier);
    }

    // Handle require() and dynamic import()
    if (node.getKind() === SyntaxKind.CallExpression) {
      const expression = node.asKind(SyntaxKind.CallExpression);
      if (expression) {
        const calleeText = expression.getExpression().getText();
        if (calleeText === 'require' || calleeText === 'import') {
          const arg = expression.getArguments()[0];
          if (arg && arg.getKind() === SyntaxKind.StringLiteral) {
            imports.push(arg.getText().replace(/['"]/g, ''));
          }
        }
      }
    }
  });

  // Process imports: Remove webpack syntax, handle scoped packages, filter built-in modules
  return imports
    .map((imp) => imp.replace(/(.*)!/, '').replace(/\?.*/, ''))
    .map((imp) => (imp.startsWith('@') ? imp.replace(/(@[^/]+\/[^/]+)\/.*/, '$1') : imp.replace(/([^/]+)\/.*/, '$1')))
    .filter((imp) => !imp.startsWith('.') && !builtinModules.includes(imp));
}
