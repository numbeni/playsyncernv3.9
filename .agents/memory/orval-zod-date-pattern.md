---
name: Orval Zod date + pattern generation
description: Why OpenAPI `format: date` with `pattern` produces broken Zod schemas in this project
---

The API spec Orval config (`lib/api-spec/orval.config.ts`) uses `coerce: { body: ['bigint', 'date'] }`. When a schema property is declared as `type: string` + `format: date` + `pattern`, Orval generates a `ZodDate` schema and calls `.regex()` on it. `ZodDate` does not have a `regex` method, so `pnpm --filter @workspace/api-spec run codegen` fails with a TypeScript error.

**Why:** `format: date` forces the generated Zod type to `ZodDate`, while the `pattern` is intended for string validation. The two are incompatible in Orval's Zod generator here.

**How to apply:** For date fields that must be validated as strings (e.g., `birthDate` with pattern `^\d{4}-\d{2}-\d{2}$`), omit `format: date` and keep only `type: string` + `pattern`. This generates a `ZodString` with `.regex()`, which compiles and validates correctly. Re-run `pnpm --filter @workspace/api-spec run codegen` after changing the spec.
