---
name: API server source integration tests
description: Why the API server needs a custom ESM loader for tests that import source handlers
---

`pnpm --filter @workspace/api-server run test` uses `node --test` on `.ts` files. Node 24 strips TypeScript natively, but it still enforces ESM resolution rules for transitive imports.

The existing tests only import `../lib/test-pg.ts`, which has no extensionless relative imports, so they work. When a test imports a source handler from `../routes/accounts.ts`, it pulls in a chain of files (`middlewares/error-handler.ts`, `lib/logger.ts`, `@workspace/db`, `@workspace/api-zod`, etc.) that use extensionless relative imports and directory imports. Node cannot resolve those without help.

**Why:** Adding `.ts` extensions to all source files would be invasive, especially because generated files under `lib/api-zod/src/generated/` are overwritten by `pnpm --filter @workspace/api-spec run codegen`. A local ESM loader (`artifacts/api-server/test-loader.mjs`) registered via `--import` resolves extensionless relative imports by trying `.ts`, `.tsx`, `.js`, `.jsx`, and `index.ts` variants on disk before falling back to the default resolver.

**How to apply:** If you add a new integration test that imports a source handler or service from the API server, the test runner already loads `test-loader.mjs`. Do not modify generated clients to add `.ts` extensions; the loader handles them. If the loader is ever removed, source integration tests will break.
