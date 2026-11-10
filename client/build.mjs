// Client bundle for the Road One test bench — the same Bun.build
// configuration the Muse space runtime used for the master (HTML
// entrypoint, production define, asset naming, tailwind plugin), so the
// bench serves the program exactly as a browser received it in Muse.

import { rm } from "node:fs/promises";
import { basename, join } from "node:path";
import tailwindPlugin from "bun-plugin-tailwind";

const ROOT = join(import.meta.dir, "..");
const ENTRY = join(ROOT, "client", "index.html");
const OUTDIR = join(ROOT, "client", "dist");

if (typeof Bun === "undefined" || typeof Bun.build !== "function") {
  throw new Error("build-client must run under Bun");
}

await rm(OUTDIR, { force: true, recursive: true });
const result = await Bun.build({
  entrypoints: [ENTRY],
  outdir: OUTDIR,
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  naming: {
    asset: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    entry: "[name].[ext]",
  },
  plugins: [tailwindPlugin],
});
if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("client build failed; see logged diagnostics");
}

// Same fixup as the Muse build: Bun writes imported assets to
// `assets/<name>-<hash>.<ext>` but emits their import URLs bare
// (`./<name>-<hash>.<ext>`); re-prefix those to `./assets/...`.
const assetFiles = result.outputs
  .filter((output) => output.kind === "asset")
  .map((output) => basename(output.path));
for (const output of result.outputs) {
  if (!/\.(js|css|html)$/.test(output.path)) continue;
  let text = await output.text();
  let changed = false;
  for (const name of assetFiles) {
    const bare = `./${name}`;
    if (text.includes(bare)) {
      text = text.split(bare).join(`./assets/${name}`);
      changed = true;
    }
  }
  if (changed) await Bun.write(output.path, text);
}

console.log(`client built -> ${OUTDIR} (${result.outputs.length} outputs)`);
