// MapLibre GL 6 resolves its worker as new URL("./maplibre-gl-worker.mjs", import.meta.url), which
// under Next's bundler points at a chunk URL where no such file exists: the worker never starts,
// no source ever loads, and the map stays blank without an error. The worker is therefore served
// as a static file and MapLibre is told where it is (setWorkerUrl in components/map/ExplorerMap).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
const version = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8")).version;
mkdirSync("public/vendor", { recursive: true });
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`node_modules/maplibre-gl/dist/${name}`, `public/vendor/${name}`);
}
console.log(`vendored maplibre-gl ${version} worker into public/vendor/`);
