import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Local file-backed store for private M1 runs. Pending orders never leave the server.
// Deploy swaps this for a durable store behind the same interface; create() must stay atomic (e.g. SET NX).
const root = () => process.env.PREFLIGHT_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");

export type Bucket = "orders" | "receipts";

function file(bucket: Bucket, id: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new Error("Invalid record id");
  return path.join(root(), bucket, `${id}.json`);
}

export async function put(bucket: Bucket, id: string, json: string): Promise<void> {
  await mkdir(path.join(root(), bucket), { recursive: true });
  await writeFile(file(bucket, id), json, { encoding: "utf8", mode: 0o600 });
}

// Atomic claim: succeeds for exactly one caller, even under parallel requests.
export async function create(bucket: Bucket, id: string, json: string): Promise<boolean> {
  await mkdir(path.join(root(), bucket), { recursive: true });
  try {
    await writeFile(file(bucket, id), json, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  }
}

export async function get(bucket: Bucket, id: string): Promise<string | null> {
  try {
    return await readFile(file(bucket, id), "utf8");
  } catch {
    return null;
  }
}
