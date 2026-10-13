import { posix } from 'node:path';
import ts from 'typescript';

export function boundaryViolations(name, text) {
  const errors = [];
  const layer = name.split('/')[0];
  const protectedLayer = layer === 'core' || layer === 'application';
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  function dependency(specifier) {
    if (!protectedLayer) return;
    if (!specifier || !specifier.startsWith('.')) {
      errors.push(`outward import ${specifier ?? '<dynamic>'}`); return;
    }
    const resolved = posix.normalize(posix.join(posix.dirname(name), specifier));
    const destination = resolved.split('/')[0];
    if (destination !== 'core' && !(layer === 'application' && destination === 'application')) errors.push(`outward import ${specifier}`);
  }
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) errors.push('explicit any');
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      dependency(ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null);
    }
    if (ts.isImportTypeNode(node)) dependency(ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal) ? node.argument.literal.text : null);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const value = node.moduleReference.expression;
      dependency(value && ts.isStringLiteral(value) ? value.text : null);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0];
      dependency(argument && ts.isStringLiteral(argument) ? argument.text : null);
    }
    if (protectedLayer && ts.isIdentifier(node) && ['chrome', 'document', 'window', 'indexedDB', 'fetch', 'HTMLElement', 'HTMLInputElement'].includes(node.text)) errors.push(`platform dependency ${node.text}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return errors;
}
