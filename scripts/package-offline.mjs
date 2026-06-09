import { mkdirSync, rmSync, existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const offlineDir = "dist-offline";
const bundleDir = `${offlineDir}/quantcred-offline`;
rmSync(offlineDir, { recursive: true, force: true });
mkdirSync(bundleDir, { recursive: true });

if (!existsSync("dist")) {
  throw new Error("dist directory does not exist. Run npm run build before packaging offline bundle.");
}

await cp("dist", bundleDir, { recursive: true });

const zip = spawnSync("zip", ["-r", "quantcred-offline.zip", "quantcred-offline"], {
  cwd: offlineDir,
  stdio: "inherit"
});

if (zip.status !== 0) {
  throw new Error("zip command failed while packaging offline bundle.");
}
