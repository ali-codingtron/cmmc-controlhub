---
name: db lib silent dist corruption from zod/drizzle-zod mismatch
description: Why `pnpm --filter @workspace/db` declaration output can silently go stale/empty, cascading into unrelated "no exported member" and "no overload matches" errors across api-server.
---

## The trap

`drizzle-zod` 0.8.x's own `.d.ts` files import `type { z } from 'zod/v4'` internally (the zod package's bundled forward-compat v4 API, distinct in shape from the classic v3 `ZodType`/`ZodObject` returned by `import { z } from "zod"`).

Any `lib/db/src/schema/*.ts` file that does:
```ts
import { z } from "zod";           // WRONG — classic v3 shape
export const insertXSchema = createInsertSchema(xTable);
export type InsertX = z.infer<typeof insertXSchema>;
```
gets a `TS2344 ... does not satisfy the constraint 'ZodType<any, any, any>'` error, because `createInsertSchema`'s return type is v4-shaped but the local `z.infer` expects v3-shaped input. The fix is to import `{ z } from "zod/v4"` in these schema files instead — it's purely a type-level import (no runtime z.object()/parse calls in these files), so it's a zero-risk, type-only fix.

**Why this matters more than a normal type error:** `tsconfig.base.json` sets `noEmitOnError: true`. Because `lib/db` is a composite project, when these schema files error, `tsc --build` refuses to emit ANY `.d.ts` for the whole package — `dist/schema/index.d.ts` ends up as a stale/empty `export {}`. That then cascades into "no exported member `usersTable`" etc. across dozens of unrelated `api-server` files that import from `@workspace/db`, making it look like a much bigger breakage than it is.

**How to apply:** If `@workspace/api-server` typecheck shows widespread "no exported member" errors from `@workspace/db`, don't chase those directly — first run `pnpm --filter @workspace/db exec tsc -p tsconfig.json --noEmit` in isolation to find the real root-cause errors in schema files. Check each `lib/db/src/schema/*.ts` file's zod import matches the `zod/v4` convention documented in replit.md. Also confirm any package that uses `import { z } from "zod"` directly (e.g. a route file) has `zod` declared in its own `package.json` dependencies (via `catalog:`) — `zod/v4` subpath resolution fails with `Cannot find module` if the package only gets zod transitively.

## Separate, still-open, pre-existing issue (not fixed, out of scope)

`api-server` middleware functions like `requireAuth`, `requireOrg`, `requireNotAssessor` are typed with the bare `Request`/`Response`/`NextFunction` (Express default generics = `ParamsDictionary`, not generic over `P`). When such a middleware is included in a `router.get/patch(path, mw1, mw2, handler)` chain, TS's overload resolution can't unify the literal-route-inferred `{id: string}` param type with the middleware's fixed `ParamsDictionary`, so it falls back to the generic overload — every handler in that chain then sees `req.params.id` typed as `string | string[]` (TS2769 "no overload matches" on `eq(table.col, id)` calls). This is systemic across nearly every protected route in `api-server` (confirmed present in `tasks.ts`, `poams.ts`, `assessor.ts`, `admin.ts` — not introduced by any single feature). It does not affect runtime behavior (Express params are always strings at runtime). Fixing it for real means making those middleware generic over `P` everywhere they're used — a broad, cross-cutting refactor that should be its own dedicated task, not a drive-by fix.
