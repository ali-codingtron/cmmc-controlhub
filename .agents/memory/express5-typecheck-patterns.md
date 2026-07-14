---
name: Express 5 + noImplicitReturns TypeScript patterns
description: How to fix req.params types and async handler return types after @types/express@5 upgrade
---

## Problem
`@types/express@5` changed `ParamsDictionary` from `Record<string, string>` to `Record<string, string | string[]>`. Combined with `noImplicitReturns: true`, this causes two categories of errors:
1. TS2339: `req.params.X` no longer types as `string`
2. TS2322: `return res.json(...)` returns `Response` not `void`

## Fix patterns

### req.params access
- Single field: `req.params.id as string`
- Destructuring: `const { id } = req.params as Record<string, string>;`
- **CAUTION**: The Python regex fix applied `as Record<string,string>` to `= req.params` broadly, which broke comparison contexts like `req.authUser?.id === req.params.id`. Restore broken patterns to `req.params.X as string` directly.

### Async handler return type
```ts
router.get("/path", requireAuth, async (req, res): Promise<void> => {
  // ...
  return void res.json({ ... });  // not `return res.json`
});
```

### inArray with enum columns
Drizzle's `inArray(col, values)` is strict about value types when column is a pgEnum. Cast: `values as any` (not `[string, ...string[]]` which still fails).

### Archiver module (ESM target)
With `"module": "esnext"` + `"moduleResolution": "bundler"`, archiver must be:
```ts
import * as archiver from "archiver";
const archive = (archiver as any)("zip", { zlib: { level: 6 } }) as import("archiver").Archiver;
```
`import archiver = require("archiver")` fails with TS1202. `import archiver from "archiver"` fails with "no default export".

### logAudit extra fields
`logAudit(req, action, entity, id, metadata)` — `metadata` only accepts `{ entityLabel?, previousValue?, newValue? }`. Do NOT pass `organizationId` or other custom fields.

**Why:** These patterns recur any time @types/express or drizzle-orm types change between versions.
