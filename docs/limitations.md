# Limitations

- Static dependency paths describe possible impact. They do not prove execution or absence of impact. Do not skip your full correctness suite based solely on RepoLens.
- Only local committed Git repositories and TS/JS source are analyzed. Python, Java, SQL, CSS, templates, schemas, lockfiles, environment settings, and service contracts are outside the dependency model.
- Root tsconfig compiler options and path aliases are supported. `extends`, project references, nested package compiler settings, and framework-specific resolution are not fully expanded. Missing dependencies can reduce symbol bindings.
- Diagnostics count syntax errors, not every semantic TypeScript error. A clean graph is not a successful type check. Run the project's own compiler.
- Dynamic dispatch, reflection, plugin registries, computed imports, dependency injection, mocks, and configuration-driven routing can create relationships absent from the graph. Literal dynamic imports receive module confidence.
- Package `source` metadata fallback is conservative. It does not assert what Node, a bundler, or a test runner will execute. Generated build/declaration output is excluded by default.
- Declaration text hashes are sensitive to formatting and comments. Enclosing declaration changes may seed more than one symbol. Same-qualified-name declarations and overloads are merged, and renames are not tracked as identity-preserving operations.
- Test discovery uses filenames/directories, so helpers under test folders can be counted and unusually named tests can be missed. Recommendations rank test files, not cases or assertions.
- A merged baseline/current path can contain historical relationships. Deleted files are inspectable in the baseline. Historical line numbers can differ from current source.
- Compiler binding work still spans the project after an edit. Incremental AST reuse is not a claim of sublinear total analysis. Timing depends on project size, machine, and cache state.
- Config-only changes and non-source changes can invalidate more of the project than the graph shows. Run the full suite for these changes. Root tsconfig changes receive a warning; other configuration effects are not automatically modeled.
- 3,000 relevant files, 40 MiB total, and 1 MiB/file are enforced. Large files and symlinks can be skipped with warnings. The canvas displays at most 80 nodes; use search and JSON for larger reports.
- The server is for trusted local developer use. It does not execute inspected code but can consume resources reading/parsing repository metadata and source. Do not expose port 4300 through a public tunnel.
- The shop evaluation covers one controlled mutation; the pinned upstream check is static integration only. Neither establishes broad precision, recall, performance, or production readiness.
