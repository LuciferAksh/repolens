# Contributing

Use Node 24 and Git. Install with `npm ci`, then run `npm run build`, `npm test`, `npm run verify`, and `npm run format:check`. The optional `npm run verify:upstream` needs network access to clone pinned mitt source. No credentials or service keys are required to run the app.

Keep engine and UI evidence terminology aligned. Add a meaningful fixture when changing resolution or impact behavior, especially for false negatives, historical paths, and module-confidence boundaries. Never label module metadata as a compiler-resolved symbol. Keep full-suite guidance visible.

Inspected repositories must remain read-only. Do not import inspected modules, evaluate configuration, or run their package scripts. A feature that executes code requires a separately designed isolation model and explicit scope. The existing verifier executes only this project's owned shop fixture.

Generated reports, checkouts, screenshots, build output, and dependencies belong under ignored paths. Do not commit secrets or third-party source copies. Describe behavior, validation, and limitations in changes. Larger language/framework integrations should start with reproducible test cases and a design proposal.
