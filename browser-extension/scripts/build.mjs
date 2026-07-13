import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
}
mkdirSync(dist, { recursive: true });

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const prodApi = process.env.JOBLENS_API_ORIGIN || "https://api.joblens.app";
const prodWeb = process.env.JOBLENS_WEB_ORIGIN || "https://joblens.app";

const shared = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  target: ["chrome110"],
  format: "esm",
  logLevel: "info",
  define: {
    __JOBLENS_BUILD__: JSON.stringify(production ? "production" : "development"),
    __JOBLENS_API_ORIGIN__: JSON.stringify(production ? prodApi : "http://localhost:8000"),
    __JOBLENS_WEB_ORIGIN__: JSON.stringify(production ? prodWeb : "http://localhost:3000"),
  },
};

async function run() {
  const ctx = await esbuild.context({
    ...shared,
    entryPoints: {
      background: join(root, "src/background.ts"),
      content: join(root, "src/content.ts"),
      popup: join(root, "src/popup/popup.ts"),
    },
    outdir: dist,
  });

  if (watch) {
    await ctx.watch();
    console.log("watching…");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }

  const manifestSrc = production
    ? join(root, "manifest.production.json")
    : join(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestSrc, "utf8"));
  if (production) {
    manifest.version = pkg.version;
  }
  writeFileSync(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dist, "popup.html"), readFileSync(join(root, "src/popup/popup.html")));
  writeFileSync(join(dist, "popup.css"), readFileSync(join(root, "src/popup/popup.css")));
  const iconsSrc = join(root, "public/icons");
  const iconsDst = join(dist, "icons");
  mkdirSync(iconsDst, { recursive: true });
  if (existsSync(iconsSrc)) {
    cpSync(iconsSrc, iconsDst, { recursive: true });
  }

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    /* optional */
  }

  const buildInfo = {
    version: manifest.version,
    build: production ? "production" : "development",
    timestamp: new Date().toISOString(),
    commit,
    apiOrigin: production ? prodApi : "http://localhost:8000",
    webOrigin: production ? prodWeb : "http://localhost:3000",
    permissions: manifest.permissions,
    host_permissions: manifest.host_permissions,
    csp: manifest.content_security_policy,
  };
  writeFileSync(join(dist, "build-info.json"), JSON.stringify(buildInfo, null, 2));
  console.log("build complete → dist/", production ? "(production)" : "(development)");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
