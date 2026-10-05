import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processPhoto, UnsupportedPhotoError } from "./photo-processing.js";

/** A 2000x1000 JPEG tagged "rotate 90 degrees" with a GPS position, like a phone photo. */
async function phoneJpeg() {
  return sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#cc5533" } })
    .jpeg()
    .withMetadata({
      orientation: 6,
      exif: { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 27/1 0/1" } },
    })
    .toBuffer();
}

describe("processPhoto", () => {
  it("makes rotated WebP copies without EXIF/GPS", async () => {
    const input = await phoneJpeg();
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.exif).toBeDefined(); // sanity: the fixture really has EXIF

    const result = await processPhoto(input);
    const large = await sharp(result.large).metadata();
    const small = await sharp(result.small).metadata();

    expect(large.format).toBe("webp");
    expect(small.format).toBe("webp");
    expect(large.exif).toBeUndefined();
    expect(small.exif).toBeUndefined();
    // Orientation 6 turns the 2000x1000 picture upright (1000 wide, 2000 tall),
    // then it is shrunk so the longest side is 1600.
    expect(large.height).toBe(1600);
    expect(large.width).toBe(800);
    expect(small.height).toBe(400);
    expect(small.width).toBe(200);
    expect(result.width).toBe(800);
    expect(result.height).toBe(1600);
  });

  it("never enlarges a small picture", async () => {
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const result = await processPhoto(png);
    const large = await sharp(result.large).metadata();
    expect(large.format).toBe("webp");
    expect(large.width).toBe(300);
    expect(large.height).toBe(200);
    const small = await sharp(result.small).metadata();
    expect(small.width).toBe(300);
  });

  it("rejects a text file renamed to .jpg", async () => {
    const text = Buffer.from("this is not a photo");
    await expect(processPhoto(text)).rejects.toBeInstanceOf(UnsupportedPhotoError);
  });

  it("accepts a real HEIF picture and makes WebP", async () => {
    const heif = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#44aa88" },
    })
      .heif({ compression: "av1" })
      .toBuffer();
    expect((await sharp(heif).metadata()).format).toBe("heif");
    const result = await processPhoto(heif);
    expect((await sharp(result.large).metadata()).format).toBe("webp");
    expect(result.width).toBe(200);
  });

  it("rejects a garbage file that only has a HEIC header", async () => {
    const header = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(32),
    ]);
    await expect(processPhoto(header)).rejects.toBeInstanceOf(UnsupportedPhotoError);
  });

  it("rejects a picture with too many pixels (decompression bomb)", async () => {
    const bomb = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: "#ffffff" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(10 * 1024 * 1024);
    await expect(processPhoto(bomb)).rejects.toBeInstanceOf(UnsupportedPhotoError);
  });
});
