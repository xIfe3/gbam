import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalPhotoStorage, R2PhotoStorage } from "./photo-storage";

let folder = "";

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "gbam-photos-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("LocalPhotoStorage", () => {
  it("writes the bytes to folder/key, creating sub-folders", async () => {
    const storage = new LocalPhotoStorage(folder, "http://x/photos");
    const bytes = Buffer.from("hello");
    await storage.put("ab/cd.webp", bytes, "image/webp");

    const saved = await readFile(path.join(folder, "ab", "cd.webp"));
    expect(saved.equals(bytes)).toBe(true);
  });

  it("builds the public url from the base url and key", () => {
    const storage = new LocalPhotoStorage(folder, "http://x/photos");
    expect(storage.publicUrl("ab/cd.webp")).toBe("http://x/photos/ab/cd.webp");
  });

  it("deletes a stored file", async () => {
    const storage = new LocalPhotoStorage(folder, "http://x/photos");
    await storage.put("a.webp", Buffer.from("1"), "image/webp");
    await storage.delete("a.webp");

    await expect(stat(path.join(folder, "a.webp"))).rejects.toThrow();
  });

  it("does not throw when deleting a missing key", async () => {
    const storage = new LocalPhotoStorage(folder, "http://x/photos");
    await expect(storage.delete("missing.webp")).resolves.toBeUndefined();
  });

  it("rejects keys that climb out of the folder or start with a slash", async () => {
    const storage = new LocalPhotoStorage(folder, "http://x/photos");
    await expect(storage.put("../evil", Buffer.from("x"), "image/webp")).rejects.toThrow();
    await expect(storage.put("/abs", Buffer.from("x"), "image/webp")).rejects.toThrow();
    await expect(storage.delete("../evil")).rejects.toThrow();
  });
});

describe("public urls", () => {
  it("never has a double slash when the base url ends with one", () => {
    const local = new LocalPhotoStorage(folder, "http://x/photos/");
    expect(local.publicUrl("ab/cd.webp")).toBe("http://x/photos/ab/cd.webp");

    const r2 = new R2PhotoStorage({
      accountId: "acc",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
      publicBaseUrl: "https://photos.gbam.app/",
    });
    expect(r2.publicUrl("ab/cd.webp")).toBe("https://photos.gbam.app/ab/cd.webp");
  });
});
