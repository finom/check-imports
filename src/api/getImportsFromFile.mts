import { promises as fs } from 'node:fs';
import { isBuiltin } from 'node:module';
import { Node, Project, SyntaxKind, ts } from 'ts-morph';

const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve },
});

const IGNORE_MARKER = /\bcheck-imports-ignore-line\b/;
const PACKAGE_NAME = /^(?:@[a-z0-9-][a-z0-9._-]*\/)?[a-z0-9-][a-z0-9._-]*$/i;

// `lodash/pick` → `lodash`, `@scope/pkg/x` → `@scope/pkg`, `loader!pkg?query` → `pkg`.
// Null for what isn't an npm package: relative and absolute paths, built-ins, URLs, `#imports` and aliases such as `@/x`.
export function toPackageName(specifier: string): string | null {
  const request = specifier.replace(/^.*!/, '').replace(/\?.*$/, '');
  if (/^[./#]/.test(request) || /^[a-z][a-z\d+.-]*:/i.test(request) || isBuiltin(request)) return null;

  const [first, second] = request.split('/');
  const name = first.startsWith('@') ? (second ? `${first}/${second}` : '') : first;
  return PACKAGE_NAME.test(name) ? name : null;
}

// Lines with a `check-imports-ignore-line` comment, plus the line after such a comment that stands on its own line.
function getIgnoredLines(sourceFile: ts.SourceFile): Set<number> {
  const text = sourceFile.text;
  const ignored = new Set<number>();
  if (!IGNORE_MARKER.test(text)) return ignored;

  const lineOf = (pos: number) => sourceFile.getLineAndCharacterOfPosition(pos).line;
  const seen = new Set<number>();

  const visit = (node: ts.Node) => {
    const children = node.getChildren(sourceFile);
    if (children.length) {
      children.forEach(visit);
      return;
    }
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
    ];
    for (const { pos, end } of ranges) {
      if (seen.has(pos) || !IGNORE_MARKER.test(text.slice(pos, end))) continue;
      seen.add(pos);
      const startLine = lineOf(pos);
      const endLine = lineOf(end);
      for (let line = startLine; line <= endLine; line++) ignored.add(line);

      const lineStart = sourceFile.getPositionOfLineAndCharacter(startLine, 0);
      const lineEnd = sourceFile.getLineEndOfPosition(end);
      if (!text.slice(lineStart, pos).trim() && !text.slice(end, lineEnd).trim()) ignored.add(endLine + 1);
    }
  };
  visit(sourceFile);

  return ignored;
}

export default async function getImportsFromFile(filePath: string): Promise<string[]> {
  const sourceFile = project.createSourceFile(filePath, await fs.readFile(filePath, 'utf8'), { overwrite: true });
  try {
    const compilerNode = sourceFile.compilerNode;
    const ignoredLines = getIgnoredLines(compilerNode);
    const imports: string[] = [];

    const add = (node: Node | undefined) => {
      if (!node || !(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) return;
      if (ignoredLines.has(compilerNode.getLineAndCharacterOfPosition(node.getStart()).line)) return;
      const name = toPackageName(node.getLiteralValue());
      if (name) imports.push(name);
    };

    sourceFile.forEachDescendant((node) => {
      if (Node.isImportDeclaration(node) || Node.isExportDeclaration(node)) {
        add(node.getModuleSpecifier());
      } else if (Node.isExternalModuleReference(node)) {
        add(node.getExpression());
      } else if (Node.isCallExpression(node)) {
        const callee = node.getExpression();
        if (
          (Node.isIdentifier(callee) && callee.getText() === 'require') ||
          callee.getKind() === SyntaxKind.ImportKeyword
        ) {
          add(node.getArguments()[0]);
        }
      }
    });

    return imports;
  } finally {
    project.removeSourceFile(sourceFile);
  }
}
