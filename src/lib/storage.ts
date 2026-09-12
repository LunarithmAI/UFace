import { openDB, type DBSchema } from "idb";
import {
  ProfileSchema,
  ScanSchema,
  type Profile,
  type Scan,
} from "./contracts";
import { z } from "zod";
const CompletionSchema = z
  .object({
    scanId: z.uuid(),
    actionIndex: z.number().int().min(0).max(7),
    bucket: z.union([z.literal("once"), z.iso.date()]),
  })
  .strict();
const PhotoSchema = z
  .object({
    scanId: z.uuid(),
    blob: z.custom<Blob>(
      (value) =>
        value instanceof Blob &&
        value.type === "image/jpeg" &&
        value.size > 0 &&
        value.size <= 3 * 1024 * 1024,
    ),
  })
  .strict();
export type Completion = {
  scanId: string;
  actionIndex: number;
  bucket: string;
};
export type Recovery = {
  store: "profile" | "scans" | "photos" | "completions";
  key: IDBValidKey;
  message: string;
};
interface Database extends DBSchema {
  profile: { key: string; value: Profile };
  scans: { key: string; value: Scan; indexes: { createdAt: string } };
  photos: { key: string; value: { scanId: string; blob: Blob } };
  completions: { key: [string, number, string]; value: Completion };
}
const database = () =>
  openDB<Database>("uface", 1, {
    upgrade(db) {
      db.createObjectStore("profile");
      db.createObjectStore("scans", { keyPath: "id" }).createIndex(
        "createdAt",
        "createdAt",
      );
      db.createObjectStore("photos", { keyPath: "scanId" });
      db.createObjectStore("completions", {
        keyPath: ["scanId", "actionIndex", "bucket"],
      });
    },
  });
// Serialize mutations so a deletion always follows any previously started save.
let queue: Promise<unknown> = Promise.resolve();
function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => {});
  return next;
}
export const completionKey = (c: Completion) =>
  JSON.stringify([c.scanId, c.actionIndex, c.bucket]);
export function completionBucket(
  frequency: "daily" | "weekly" | "once",
  now = new Date(),
): string {
  if (frequency === "once") return "once";
  const d = new Date(now);
  if (frequency === "weekly") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export async function loadData() {
  const db = await database();
  try {
    const tx = db.transaction(["profile", "scans", "photos", "completions"]);
    const recovery: Recovery[] = [];
    let profile: Profile | null = null;
    const scans: Scan[] = [];
    const photos = new Map<string, Blob>();
    const completions: Completion[] = [];
    for (const store of [
      "profile",
      "scans",
      "photos",
      "completions",
    ] as const) {
      let cursor = await tx.objectStore(store).openCursor();
      while (cursor) {
        const value: unknown = cursor.value;
        let valid = false;
        if (store === "profile") {
          const p = ProfileSchema.safeParse(value);
          valid = p.success && cursor.key === "current";
          if (valid && p.success) profile = p.data;
        } else if (store === "scans") {
          const s = ScanSchema.safeParse(value);
          valid = s.success;
          if (s.success) scans.push(s.data);
        } else if (store === "photos") {
          const p = PhotoSchema.safeParse(value);
          valid = p.success && scans.some((s) => s.id === p.data.scanId);
          if (valid && p.success) photos.set(p.data.scanId, p.data.blob);
        } else {
          const c = CompletionSchema.safeParse(value);
          if (c.success) {
            const scan = scans.find((s) => s.id === c.data.scanId),
              action = scan?.advice.routine[c.data.actionIndex];
            valid =
              !!action &&
              (action.frequency === "once"
                ? c.data.bucket === "once"
                : c.data.bucket !== "once");
            if (valid) completions.push(c.data);
          }
        }
        if (!valid)
          recovery.push({
            store,
            key: cursor.key,
            message: `An unreadable ${store} entry could not be loaded.`,
          });
        cursor = await cursor.continue();
      }
    }
    await tx.done;
    return {
      profile,
      scans: scans.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      photos,
      completions,
      recovery,
    };
  } finally {
    db.close();
  }
}
export function saveProfile(
  profile: Profile,
  valid: () => boolean = () => true,
) {
  return mutate(async () => {
    if (!valid()) return;
    const db = await database();
    try {
      if (!valid()) return;
      await db.put("profile", ProfileSchema.parse(profile), "current");
    } finally {
      db.close();
    }
  });
}
export function saveScan(
  scan: Scan,
  photo: Blob | undefined,
  valid: () => boolean = () => true,
) {
  return mutate(async () => {
    if (!valid()) return;
    const db = await database();
    try {
      if (!valid()) return;
      const tx = db.transaction(["scans", "photos"], "readwrite");
      await tx.objectStore("scans").put(ScanSchema.parse(scan));
      if (photo)
        await tx.objectStore("photos").put({ scanId: scan.id, blob: photo });
      await tx.done;
    } finally {
      db.close();
    }
  });
}
export function saveCompletion(
  completion: Completion,
  checked: boolean,
  valid: () => boolean = () => true,
) {
  return mutate(async () => {
    if (!valid()) return;
    const db = await database();
    try {
      if (!valid()) return;
      if (checked) await db.put("completions", completion);
      else
        await db.delete("completions", [
          completion.scanId,
          completion.actionIndex,
          completion.bucket,
        ]);
    } finally {
      db.close();
    }
  });
}
export function deleteScan(id: string) {
  return mutate(async () => {
    const db = await database();
    try {
      const tx = db.transaction(
        ["scans", "photos", "completions"],
        "readwrite",
      );
      await tx.objectStore("scans").delete(id);
      await tx.objectStore("photos").delete(id);
      let c = await tx.objectStore("completions").openCursor();
      while (c) {
        if (c.value?.scanId === id || c.primaryKey[0] === id) await c.delete();
        c = await c.continue();
      }
      await tx.done;
    } finally {
      db.close();
    }
  });
}
export function deleteRecovery(entry: Recovery) {
  if (entry.store === "scans" && typeof entry.key === "string")
    return deleteScan(entry.key);
  return mutate(async () => {
    const db = await database();
    try {
      const tx = db.transaction(entry.store, "readwrite");
      await tx.store.delete(entry.key as never);
      await tx.done;
    } finally {
      db.close();
    }
  });
}
export function clearData() {
  return mutate(async () => {
    const db = await database();
    try {
      const tx = db.transaction(
        ["profile", "scans", "photos", "completions"],
        "readwrite",
      );
      await Promise.all([
        tx.objectStore("profile").clear(),
        tx.objectStore("scans").clear(),
        tx.objectStore("photos").clear(),
        tx.objectStore("completions").clear(),
      ]);
      await tx.done;
    } finally {
      db.close();
    }
  });
}
