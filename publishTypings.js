import pkg from "fs-extra";
import { join, dirname } from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const { writeFileSync, ensureDir, copy } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

async function getAllElectronVersions(lastVersion) {
  const response = await fetch("https://registry.npmjs.org/electron");
  const data = await response.json();
  return Object.keys(data.versions)
    .filter((version) => {
      const [majorLast, minorLast, patchLast] = lastVersion
        .split(".")
        .map(Number);
      const [major, minor, patch] = version.split(".").map(Number);
      if (major > majorLast) return true;
      if (major === majorLast && minor > minorLast) return true;
      if (major === majorLast && minor === minorLast && patch > patchLast)
        return true;
      return false;
    })
    .sort((a, b) => {
      const [majorA, minorA, patchA] = a.split(".").map(Number);
      const [majorB, minorB, patchB] = b.split(".").map(Number);
      return majorA - majorB || minorA - minorB || patchA - patchB;
    });
}

async function extractAndPublish(version) {
  try {
    const lastVersionPath = join(__dirname, "lastVersion.json");
    const lastVersion = require(lastVersionPath).lastVersion;

    if (lastVersion === version) {
      console.log(`Version ${version} is already published. Skipping.`);
      return;
    }

    // Update package.json with the new Electron version
    const packageJsonPath = join(__dirname, "package.json");
    const packageJson = require(packageJsonPath);
    packageJson.dependencies.electron = version;
    packageJson.version = version.replace("^", ""); // Ensure versioning aligns with Electron version
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Install the specific version of Electron
    execSync("npm install", { stdio: "inherit" });

    // Extract the typings
    const electronPath = dirname(require.resolve("electron/package.json"));
    const typingsPath = join(electronPath, "electron.d.ts");
    const destinationPath = join(__dirname, "dist", "electron.d.ts");
    await ensureDir(dirname(destinationPath));
    await copy(typingsPath, destinationPath);
    console.log("Typings extracted successfully!");

    // Publish the package
    execSync("npm publish", { stdio: "inherit" });
    console.log("Package published successfully!");

    // Update last published version
    writeFileSync(
      lastVersionPath,
      JSON.stringify({ lastVersion: version }, null, 2)
    );
  } catch (error) {
    console.error("Error during extraction and publishing:", error);
  }
}

async function main() {
  const lastVersionPath = join(__dirname, "lastVersion.json");
  const lastVersion = require(lastVersionPath).lastVersion;
  const versions = await getAllElectronVersions(lastVersion);

  for (const version of versions) {
    if (version > lastVersion) {
      console.log(`Processing Electron version ${version}`);
      await extractAndPublish(version);
    }
  }
}

main().catch(console.error);
