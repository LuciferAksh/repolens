# Verification

## Automated checks

`npm test` compiles server code, then runs isolated Git-fixture tests and real HTTP integration checks. Coverage includes alias/re-export calls, added/deleted code, historical paths, class constructors, type relationships, namespace/default exports, tsconfig aliases, dynamic import warnings, cycles, snapshot caching, source containment, nonexecution of inspected code, invalid revisions, paths with spaces, CRLF checkout conversion, unbuilt package-source fallback, what-if immutability, and API request guards.

The HTTP test starts the compiled server on an ephemeral loopback port, waits for analysis, reads source, requests a what-if report, exports the original report, toggles watching, validates malformed/cross-origin requests, and rescans. This checks the actual worker/server boundary.

## Observed fixture evaluation

`npm run verify` creates a fresh copy of the owned shop example in an OS temporary directory and initializes its Git baseline. It introduces a one-unit surcharge in `calculateTotal`, obtains recommendations, and executes every fixture test file separately using Node's test runner with tsx. It also reruns the healthy baseline and verifies all tests pass.

Expected observations:

| Test file         | Healthy baseline | Pricing mutation | Recommended |
| ----------------- | ---------------- | ---------------- | ----------- |
| pricing.test.ts   | Pass             | Fail             | Yes         |
| checkout.test.ts  | Pass             | Fail             | Yes         |
| invoice.test.ts   | Pass             | Fail             | Yes         |
| webhooks.test.ts  | Pass             | Fail             | Yes         |
| refunds.test.ts   | Pass             | Pass             | No          |
| money.test.ts     | Pass             | Pass             | No          |
| inventory.test.ts | Pass             | Pass             | No          |

Observed failure recall is 4/4 and selection is 4/7 **for this mutation only**. Passing unselected tests here do not establish safe omission for future changes. Reports include generation time and rescan reuse statistics; timing is measured, not a fixed performance promise.

## External source integration

`npm run verify:upstream` checks [developit/mitt](https://github.com/developit/mitt/tree/6b41670516ed8e8b738612f60491995470aa63b3) at immutable commit `6b41670516ed8e8b738612f60491995470aa63b3`. The script verifies a clean pinned checkout, temporarily changes handler-map initialization, and asserts that `test/index_test.ts` is recommended. Original bytes are restored even on failure.

mitt's test imports its root package while generated dist/types entries are absent in a source checkout. RepoLens uses the declared package source entry as **module fallback** and warns about the evidence boundary. Upstream tests, dependencies, and build scripts are not run. This confirms source integration and a known consumer relationship, not observed upstream test failure or benchmark accuracy.

## Manual dashboard checks

Before publication, verify the demo through the real browser: file and symbol graphs, path selection, working/baseline source, test filtering, what-if reset, watch/rescan, JSON download, and the observed Validation table. Check desktop and narrow viewport layouts. CI checks builds and repeatable engine/API/fixture checks; it does not replace visual QA.
