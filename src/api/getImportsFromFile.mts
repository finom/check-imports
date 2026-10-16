import { promises as fs } from 'node:fs';
import { isBuiltin } from 'node:module';
import { Node, Project, SyntaxKind, ts } from 'ts-morph';
import resolveAlias, { resolveSourceFile } from './resolveAlias.mjs';
import path from 'node:path';

const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve },
});

const IGNORE_MARKER = /\bcheck-imports-ignore-line\b/;
const PACKAGE_NAME = /^(?:@[a-z0-9-][a-z0-9._-]*\/)?[a-z0-9-][a-z0-9._-]*$/i;

// `typeOnly`: `import type`, `export type … from`, or any import in a .d.ts file; TypeScript removes these.
export type FileImport = { name: string; aliased: boolean; typeOnly: boolean };

// `lodash/pick` → `lodash`, `@scope/pkg/x` → `@scope/pkg`, `loader!pkg?query` → `pkg`. Or the source file a relative
// path or a tsconfig/jsconfig alias loads (`aliased`: the alias had a valid package name).
// Neither for built-ins, URLs, `#imports`, names npm can't publish such as `@/x`, and paths to other files.
function resolveSpecifier(
  specifier: string,
  filePath: string,
): { package?: Omit<FileImport, 'typeOnly'>; file?: string | null } {
  const request = specifier.replace(/^.*!/, '').replace(/\?.*$/, '');
  if (/^\.\.?(?:\/|$)/.test(request) || path.isAbsolute(request)) {
    return { file: resolveSourceFile(path.resolve(path.dirname(filePath), request)) };
  }
  if (/^#/.test(request) || /^[a-z][a-z\d+.-]*:/i.test(request) || isBuiltin(request)) return {};

  const [first, second] = request.split('/');
  const name = first.startsWith('@') ? (second ? `${first}/${second}` : '') : first;
  const target = resolveAlias(filePath, request, name);
  const file = target && resolveSourceFile(target);
  return PACKAGE_NAME.test(name) ? { package: { name, aliased: target !== null }, file } : { file };
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

export default async function getImportsFromFile(
  filePath: string,
): Promise<{ imports: FileImport[]; localFiles: string[] }> {
  // one virtual name per extension: the parser reads the kind (TS, TSX, JS) from it, and the virtual tree stays flat
  const sourceFile = project.createSourceFile(`/file${path.extname(filePath)}`, await fs.readFile(filePath, 'utf8'), {
    overwrite: true,
  });
  try {
    const compilerNode = sourceFile.compilerNode;
    const ignoredLines = getIgnoredLines(compilerNode);
    const imports: FileImport[] = [];
    const localFiles: string[] = [];

    const declarationFile = /\.d\.[cm]?ts$/.test(filePath);
    const add = (node: Node | undefined, typeOnly = false) => {
      if (!node || !(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) return;
      if (ignoredLines.has(compilerNode.getLineAndCharacterOfPosition(node.getStart()).line)) return;
      const { package: found, file } = resolveSpecifier(node.getLiteralValue(), filePath);
      if (found) imports.push({ ...found, typeOnly: typeOnly || declarationFile });
      if (file) localFiles.push(file);
    };

    sourceFile.forEachDescendant((node) => {
      if (Node.isImportDeclaration(node) || Node.isExportDeclaration(node)) {
        add(node.getModuleSpecifier(), node.isTypeOnly());
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

    return { imports, localFiles };
  } finally {
    project.removeSourceFile(sourceFile);
  }
}
