// @ts-check
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import color from "cli-color";
import { getLastUpdateCheck, setLastUpdateCheck } from "./store.mjs";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get the current package version
 * @returns {string}
 */
function getCurrentVersion() {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(dirname, "../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

/**
 * Check if we should check for updates (only once per week)
 * @returns {boolean}
 */
function shouldCheckForUpdates() {
  const lastCheck = getLastUpdateCheck();
  return Date.now() - lastCheck > ONE_WEEK_MS;
}

/**
 * Fetch the latest version from npm registry
 * @returns {Promise<string | null>}
 */
async function fetchLatestVersion() {
  try {
    const response = await fetch("https://registry.npmjs.org/my-reviews/latest");
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * Compare version strings (simple semver comparison)
 * @param {string} current
 * @param {string} latest
 * @returns {boolean} true if latest is newer than current
 */
function isNewerVersion(current, latest) {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

/**
 * Check for updates and notify user if a new version is available
 */
export async function checkForUpdates() {
  if (!shouldCheckForUpdates()) {
    return;
  }

  setLastUpdateCheck();

  const currentVersion = getCurrentVersion();
  const latestVersion = await fetchLatestVersion();

  if (!latestVersion) {
    return; // Silently fail if we can't fetch the latest version
  }

  if (isNewerVersion(currentVersion, latestVersion)) {
    const b = color.yellow("┃");
    console.log(`\n${b} Update available: ${color.green(`${currentVersion} → ${latestVersion}`)}`);
    console.log(`${b} Run: ${color.cyan("npm install -g my-reviews")}`);
    console.log(`${b} ${color.cyan("https://github.com/gregtatum/my-reviews/blob/main/CHANGELOG.md")}\n`);
  }
}
