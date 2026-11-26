// Bundles the card into one file inside the component folder, which the release ZIP contains.
import { readFileSync } from "node:fs";
import { build, context } from "esbuild";

const manifest = JSON.parse(readFileSync("../custom_components/config_entry_panel/manifest.json", "utf8"));

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "../custom_components/config_entry_panel/frontend/config-entry-panel.js",
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: true,
  legalComments: "none",
  loader: { ".json": "json" },
  define: { __PANEL_VERSION__: JSON.stringify(manifest.version) },
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const watcher = await context({ ...options, minify: false, sourcemap: "inline" });
  await watcher.watch();
} else {
  await build(options);
}
