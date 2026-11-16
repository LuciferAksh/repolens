import ts from 'typescript';
import { performance } from 'node:perf_hooks';
import { dirname, relative, resolve } from 'node:path';
import { hash, inside, isSource, slash, type Snapshot } from './git.js';
import type { Graph, GraphEdge, GraphNode, NodeKind, Relation } from './types.js';

type Declaration = { ast: ts.Node; node: GraphNode };
type Extraction = { source: ts.SourceFile; declarations: Declaration[] };
export const isTestFile = (path: string) =>
  /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/i.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path);
const key = (file: string) => slash(resolve(file));
const line = (source: ts.SourceFile, pos: number) =>
  source.getLineAndCharacterOfPosition(Math.max(0, pos)).line + 1;

function nameOf(node: ts.Node): string | undefined {
  const name = (node as ts.NamedDeclaration).name;
  if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)))
    return name.text;
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword))
    return 'default';
  return undefined;
}

function kindOf(node: ts.Node): NodeKind | undefined {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
    return 'method';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type';
  if (ts.isVariableDeclaration(node)) {
    if (
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    )
      return 'function';
    if (
      ts.isVariableDeclarationList(node.parent) &&
      ts.isVariableStatement(node.parent.parent) &&
      ts.isSourceFile(node.parent.parent.parent)
    )
      return 'value';
  }
  return undefined;
}

function extract(source: ts.SourceFile, file: string): Extraction {
  const declarations: Declaration[] = [];
  const visit = (ast: ts.Node, parents: string[]) => {
    const name = nameOf(ast),
      kind = kindOf(ast);
    let next = parents;
    if (name && kind) {
      const qualifiedName = [...parents, name].join('.');
      const modifiers = ts.canHaveModifiers(ast) ? ts.getModifiers(ast) : undefined;
      const exported =
        !!modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword,
        ) ||
        (ts.isVariableDeclaration(ast) &&
          ts.isVariableStatement(ast.parent.parent) &&
          !!ast.parent.parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
      declarations.push({
        ast,
        node: {
          id: `symbol:${file}#${qualifiedName}`,
          name,
          qualifiedName,
          file,
          kind,
          line: line(source, ast.getStart(source)),
          endLine: line(source, ast.end),
          hash: hash(ast.getText(source)),
          exported,
          test: isTestFile(file),
        },
      });
      next = [...parents, name];
    }
    ts.forEachChild(ast, (child) => visit(child, next));
  };
  visit(source, []);
  return { source, declarations };
}

/** One persistent language service per snapshot: versioned source snapshots and reusable ASTs. */
export class ProjectIndex {
  private files = new Map<string, { content: string; version: number }>();
  private options: ts.CompilerOptions = {};
  private projectVersion = 0;
  private extraction = new Map<string, Extraction>();
  private graph?: Graph;
  private settingsHash = '';
  private service: ts.LanguageService;
  constructor(private root: string) {
    const libRoot = dirname(ts.getDefaultLibFilePath({}));
    const allowed = (file: string) =>
      inside(libRoot, file) ||
      (inside(this.root, file) &&
        (!isSource(file) || (slash(file).includes('/node_modules/') && /\.d\.[cm]?ts$/.test(file))));
    const readFile = (file: string) =>
      this.files.get(key(file))?.content ?? (allowed(file) ? ts.sys.readFile(file) : undefined);
    const fileExists = (file: string) =>
      this.files.has(key(file)) || (allowed(file) && ts.sys.fileExists(file));
    this.service = ts.createLanguageService(
      {
        getScriptFileNames: () => [...this.files.keys()].filter(isSource),
        getScriptVersion: (file) => String(this.files.get(key(file))?.version ?? 0),
        getProjectVersion: () => String(this.projectVersion),
        getScriptSnapshot: (file) => {
          const content = readFile(file);
          return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
        },
        getCompilationSettings: () => this.options,
        getCurrentDirectory: () => this.root,
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
        readFile,
        fileExists,
        readDirectory: ts.sys.readDirectory,
        directoryExists: (dir) =>
          [...this.files.keys()].some((file) => file.startsWith(`${key(dir)}/`)) ||
          (allowed(dir) && ts.sys.directoryExists(dir)),
        getDirectories: ts.sys.getDirectories,
      },
      ts.createDocumentRegistry(),
    );
  }

  update(snapshot: Snapshot): Graph {
    const start = performance.now();
    const configText = snapshot.files.get('tsconfig.json') ?? snapshot.files.get('jsconfig.json');
    const warnings = [...snapshot.warnings];
    let options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
    };
    if (configText) {
      const parsed = ts.parseConfigFileTextToJson('tsconfig.json', configText);
      if (parsed.error)
        warnings.push('Root TypeScript configuration could not be parsed; default resolution is in use');
      else {
        const converted = ts.convertCompilerOptionsFromJson(parsed.config.compilerOptions ?? {}, this.root);
        options = { ...options, ...converted.options, noEmit: true, allowJs: true };
        if (parsed.config.extends || parsed.config.references)
          warnings.push(
            'Root tsconfig options are supported; inherited/project-reference compiler options are not expanded',
          );
      }
    }
    const settingsHash = hash(JSON.stringify(options));
    let changed = settingsHash !== this.settingsHash;
    const next = new Map<string, { content: string; version: number }>();
    for (const [file, content] of snapshot.files) {
      const full = key(resolve(this.root, file));
      const previous = this.files.get(full);
      if (!previous || previous.content !== content) changed = true;
      next.set(full, {
        content,
        version: previous ? previous.version + Number(previous.content !== content) : 1,
      });
    }
    if (next.size !== this.files.size) changed = true;
    this.files = next;
    this.options = options;
    this.settingsHash = settingsHash;
    if (!changed && this.graph)
      return {
        ...this.graph,
        stats: {
          ...this.graph.stats,
          reusedFiles: this.graph.stats.files,
          indexedFiles: 0,
          buildMs: +(performance.now() - start).toFixed(2),
        },
      };
    this.projectVersion++;
    const program = this.service.getProgram();
    if (!program) throw new Error('TypeScript could not create an analysis program');
    const checker = program.getTypeChecker();
    const nodes = new Map<string, GraphNode>(),
      edges = new Map<string, GraphEdge>();
    const astToId = new Map<ts.Node, string>();
    const sources: { source: ts.SourceFile; file: string; records: Declaration[] }[] = [];
    let reusedFiles = 0,
      indexedFiles = 0,
      diagnosticCount = 0;
    for (const [file, content] of snapshot.files) {
      if (!isSource(file)) continue;
      const source = program.getSourceFile(resolve(this.root, file));
      if (!source) continue;
      diagnosticCount += this.service.getSyntacticDiagnostics(source.fileName).length;
      const cached = this.extraction.get(file);
      const extraction = cached?.source === source ? cached : extract(source, file);
      if (extraction === cached) reusedFiles++;
      else indexedFiles++;
      this.extraction.set(file, extraction);
      nodes.set(`file:${file}`, {
        id: `file:${file}`,
        name: file.split('/').at(-1)!,
        qualifiedName: file,
        file,
        kind: 'file',
        line: 1,
        endLine: source.getLineStarts().length,
        hash: hash(content),
        exported: false,
        test: isTestFile(file),
      });
      for (const record of extraction.declarations) {
        const previous = nodes.get(record.node.id);
        // Overload signatures share a stable identity with their implementation.
        nodes.set(
          record.node.id,
          previous
            ? {
                ...record.node,
                line: Math.min(previous.line, record.node.line),
                hash: hash(previous.hash + record.node.hash),
              }
            : record.node,
        );
        astToId.set(record.ast, record.node.id);
        if (
          ts.isVariableDeclaration(record.ast) &&
          record.ast.initializer &&
          (ts.isArrowFunction(record.ast.initializer) || ts.isFunctionExpression(record.ast.initializer))
        )
          astToId.set(record.ast.initializer, record.node.id);
      }
      sources.push({ source, file, records: extraction.declarations });
    }
    for (const file of this.extraction.keys()) if (!snapshot.files.has(file)) this.extraction.delete(file);
    const targetIds = (symbol: ts.Symbol | undefined): string[] => {
      if (!symbol) return [];
      if (symbol.flags & ts.SymbolFlags.Alias) {
        try {
          symbol = checker.getAliasedSymbol(symbol);
        } catch {
          return [];
        }
      }
      const ids = new Set<string>();
      for (const declaration of symbol.declarations ?? []) {
        const id = astToId.get(declaration);
        if (id) ids.add(id);
      }
      return [...ids];
    };
    const add = (source: string, target: string, kind: Relation, file: string, at: number) => {
      if (source === target || !nodes.has(target)) return;
      const id = `${source}|${kind}|${target}`;
      if (!edges.has(id)) edges.set(id, { id, source, target, kind, file, line: at });
    };
    let unresolved = 0,
      dynamic = 0,
      packageFallbacks = 0;
    for (const { source, file } of sources) {
      const module = (text: string, kind: Relation, at: number) => {
        const resolved = ts.resolveModuleName(text, source.fileName, options, {
          fileExists: (path) => this.files.has(key(path)) || (!isSource(path) && ts.sys.fileExists(path)),
          readFile: (path) =>
            this.files.get(key(path))?.content ?? (!isSource(path) ? ts.sys.readFile(path) : undefined),
          directoryExists: (dir) =>
            [...this.files.keys()].some((path) => path.startsWith(`${key(dir)}/`)) ||
            ts.sys.directoryExists(dir),
          getCurrentDirectory: () => this.root,
        }).resolvedModule;
        if (resolved) {
          const target = slash(relative(this.root, resolved.resolvedFileName));
          add(`file:${file}`, `file:${target}`, kind, file, at);
        } else if (text.startsWith('.')) {
          // Some source repositories publish only generated dist/types entries.
          // A declared source entry is useful module evidence, never a symbol binding.
          const directory = resolve(dirname(source.fileName), text);
          const manifest = this.files.get(key(resolve(directory, 'package.json')))?.content;
          let target: string | undefined;
          try {
            const entry: unknown = manifest ? JSON.parse(manifest).source : undefined;
            if (typeof entry === 'string') {
              const path = resolve(directory, entry);
              if (inside(this.root, path) && this.files.has(key(path)) && isSource(path))
                target = slash(relative(this.root, path));
            }
          } catch {
            /* Invalid metadata is not executable configuration. */
          }
          if (target) {
            add(`file:${file}`, `file:${target}`, kind, file, at);
            packageFallbacks++;
          } else unresolved++;
        } else if (text.startsWith('@/')) unresolved++;
      };
      const visit = (ast: ts.Node, owner: string, inType: boolean) => {
        const nextOwner = astToId.get(ast) ?? owner;
        const typeContext = inType || ts.isTypeNode(ast);
        if (
          (ts.isImportDeclaration(ast) || ts.isExportDeclaration(ast)) &&
          ast.moduleSpecifier &&
          ts.isStringLiteral(ast.moduleSpecifier)
        )
          module(
            ast.moduleSpecifier.text,
            ts.isExportDeclaration(ast) ? 're-export' : 'import',
            line(source, ast.getStart(source)),
          );
        if (ts.isCallExpression(ast) || ts.isNewExpression(ast)) {
          const isImport =
            ts.isCallExpression(ast) &&
            (ast.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(ast.expression) && ast.expression.text === 'require'));
          if (isImport) {
            const argument = ast.arguments?.[0];
            if (argument && ts.isStringLiteral(argument))
              module(argument.text, 'dynamic-import', line(source, ast.getStart(source)));
            else dynamic++;
          }
          const signature = checker.getResolvedSignature(ast);
          const target = signature?.declaration && astToId.get(signature.declaration);
          if (target) add(nextOwner, target, 'call', file, line(source, ast.getStart(source)));
        }
        if (ts.isIdentifier(ast)) {
          const parent = ast.parent;
          const declarationParent =
            kindOf(parent) !== undefined ||
            ts.isParameter(parent) ||
            ts.isPropertyDeclaration(parent) ||
            ts.isPropertySignature(parent) ||
            ts.isTypeParameterDeclaration(parent) ||
            ts.isBindingElement(parent) ||
            ts.isEnumDeclaration(parent) ||
            ts.isEnumMember(parent);
          const isDefinition = declarationParent && (parent as ts.NamedDeclaration).name === ast;
          const importName =
            ts.isImportSpecifier(parent) ||
            ts.isImportClause(parent) ||
            ts.isNamespaceImport(parent) ||
            ts.isExportSpecifier(parent);
          if (!isDefinition && !importName) {
            let symbol = checker.getSymbolAtLocation(ast);
            if (ts.isShorthandPropertyAssignment(parent))
              symbol = checker.getShorthandAssignmentValueSymbol(parent);
            for (const target of targetIds(symbol))
              add(
                nextOwner,
                target,
                typeContext ? 'type' : 'reference',
                file,
                line(source, ast.getStart(source)),
              );
          }
        }
        ts.forEachChild(ast, (child) => visit(child, nextOwner, typeContext));
      };
      visit(source, `file:${file}`, false);
    }
    if (unresolved) warnings.push(`${unresolved} local module specifiers could not be resolved`);
    if (packageFallbacks)
      warnings.push(
        `${packageFallbacks} module edges use package.json source metadata because generated package entries are unavailable. These are conservative candidates, not compiler-resolved symbol or runtime paths.`,
      );
    if (dynamic)
      warnings.push(`${dynamic} nonliteral dynamic imports/requires cannot be resolved statically`);
    if (diagnosticCount)
      warnings.push(`${diagnosticCount} syntax diagnostics detected; results may be incomplete`);
    warnings.push(
      'Static reference paths do not prove runtime execution. Dynamic dispatch, reflection, external packages, and config-driven dependencies can escape analysis.',
    );
    this.graph = {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      warnings,
      stats: {
        files: sources.length,
        symbols: nodes.size - sources.length,
        edges: edges.size,
        reusedFiles,
        indexedFiles,
        buildMs: +(performance.now() - start).toFixed(2),
        diagnostics: diagnosticCount,
      },
    };
    return this.graph;
  }
  dispose() {
    this.service.dispose();
  }
}
