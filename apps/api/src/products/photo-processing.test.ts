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

  it("handles HEIC either way: unsupported error or valid WebP, never a crash", async () => {
    // Only a header, so decoding fails or is refused. Both outcomes are acceptable.
    const header = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(32),
    ]);
    try {
      const result = await processPhoto(header);
      const meta = await sharp(result.large).metadata();
      expect(meta.format).toBe("webp");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedPhotoError);
    }
  });
});
