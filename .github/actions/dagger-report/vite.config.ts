import { mergeConfig } from "vite";

import { createActionViteConfig } from "../../../vite.config.base.mts";

// This action ships as a standalone `index.mjs` checked out on its own by
// consumer repos (no `pnpm install` runs there), so the bundle must inline
// its dependencies rather than leaving them as external `require()` calls.
export default mergeConfig(createActionViteConfig({ entry: "src/index.ts" }), {
  ssr: { noExternal: true },
});
