import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The only remote file this dashboard downloads. The hash is the fixture
 * published with REA's Android tests. Any other URL is refused.
 */
export const PINNED_DOWNLOADS = Object.freeze({
  "https://github.com/appium/android-apidemos/releases/download/v6.0.18/ApiDemos-debug.apk":
    "a9eecf37b26cd084855c530db81c2bb1b91f4c1b095a04f47aa7c20e2791f686",
});

export const MAX_PINNED_BYTES = 40 * 1024 * 1024;

export const pinnedDigest = (url) => PINNED_DOWNLOADS[url];

export const downloadPinned = async (url, directory, signal) => {
  const expected = pinnedDigest(url);
  if (expected === undefined) return undefined;
  const response = await fetch(url, { redirect: "follow", signal });
  if (!response.ok)
    throw new Error(`Download recusado: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PINNED_BYTES)
    throw new Error("O APK de prática passou do limite de tamanho.");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected)
    throw new Error("O SHA-256 do APK não confere com o fixado.");
  const folder = join(directory, "source");
  await mkdir(folder, { recursive: true });
  const path = join(folder, "ApiDemos-debug.apk");
  await writeFile(path, bytes);
  return path;
};
