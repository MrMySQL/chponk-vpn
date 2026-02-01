# Project Guidelines

## ESM Imports

This project uses ES Modules (`"type": "module"` in package.json).

**All local imports in `src/` must include the `.js` extension**, even for TypeScript files:

```typescript
// CORRECT
import { db } from "../db/index.js";
import { XuiClient } from "./client.js";

// WRONG - will fail on Vercel
import { db } from "../db/index";
import { XuiClient } from "./client";
```

**Why:** TypeScript path aliases and extensionless imports work with bundlers (Vite, webpack) but fail at runtime on Vercel serverless because Node.js ESM requires explicit `.js` extensions for local imports.

**Scope:** Only `src/` files need this. Test files (`tests/`) use vitest which handles resolution via `vite-tsconfig-paths`.
