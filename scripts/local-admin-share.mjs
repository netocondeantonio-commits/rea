import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Capability URLs for the loopback page. The token is not an internet login. */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/u;

const validRow = (row) =>
  Boolean(row) &&
  typeof row.token === "string" &&
  TOKEN.test(row.token) &&
  typeof row.jobId === "string" &&
  typeof row.exp === "number";

export const createShareStore = async (directory) => {
  const path = join(directory, "shares.json");
  let rows = [];
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (Array.isArray(parsed)) rows = parsed.filter(validRow);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
  const save = async () => {
    await writeFile(path, `${JSON.stringify(rows)}\n`, { mode: 0o600 });
  };
  return {
    create: async (jobId) => {
      const row = {
        token: randomBytes(24).toString("base64url"),
        jobId,
        exp: Date.now() + WEEK_MS,
      };
      rows = [row, ...rows].slice(0, 100);
      await save();
      return row;
    },
    revoke: async (token) => {
      const before = rows.length;
      rows = rows.filter((row) => row.token !== token);
      if (rows.length !== before) await save();
      return rows.length !== before;
    },
    lookup: (token) => {
      const row = rows.find((item) => item.token === token);
      if (!row || row.exp <= Date.now()) return undefined;
      return row;
    },
  };
};
