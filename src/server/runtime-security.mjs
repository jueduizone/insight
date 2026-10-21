export const minimumNodeVersion = "24.22.1";

/** @param {string} version */
export function isPatchedRuntime(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
}

export function runtimeSecurity() {
  return {
    node: process.version,
    openssl: process.versions.openssl,
    brotli: process.versions.brotli,
    minimumNodeVersion,
    patched: isPatchedRuntime(process.version),
  };
}

let logged = false;

export function assertPatchedRuntime() {
  const status = runtimeSecurity();
  if (!logged) {
    console.info("[runtime-security]", JSON.stringify(status));
    logged = true;
  }
  if (!status.patched) {
    throw new Error(`Node ${minimumNodeVersion} or a later 24.x security release is required`);
  }
}
