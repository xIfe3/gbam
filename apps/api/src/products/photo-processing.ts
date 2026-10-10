import sharp from "sharp";

const ALLOWED_FORMATS = ["jpeg", "png", "webp", "heif"];
const LARGE_SIDE = 1600;
const SMALL_SIDE = 400;

/**
 * A small file can hold a huge picture (a flat-colour PNG under 10 MB can decode to
 * hundreds of MB of pixels), so we cap the pixel count, not just the byte size.
 * 50 million pixels is about 7000 x 7000, more than any phone camera makes.
 */
const MAX_INPUT_PIXELS = 50_000_000;
const SHARP_OPTIONS = { limitInputPixels: MAX_INPUT_PIXELS };

/** The file is not a photo we can read (wrong type, corrupt, or unsupported HEIC build). */
export class UnsupportedPhotoError extends Error {
  constructor(message = "Unsupported photo", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UnsupportedPhotoError";
  }
}

export type ProcessedPhoto = { large: Buffer; small: Buffer; width: number; height: number };

/**
 * Turns an uploaded photo into two WebP files. We decide by the file's real content
 * (sharp reads it), never by the file name or the browser's claimed type.
 * sharp drops EXIF (including GPS) unless we ask to keep it, so we never call
 * `withMetadata`. `rotate()` first applies the EXIF orientation so the picture is
 * upright once the tag is gone.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  try {
    const metadata = await sharp(input, SHARP_OPTIONS).metadata();
    const format = metadata.format;
    if (format === undefined || !ALLOWED_FORMATS.includes(format)) {
      throw new UnsupportedPhotoError();
    }
    const inputWidth = metadata.width;
    const inputHeight = metadata.height;
    if (inputWidth === undefined || inputHeight === undefined) {
      throw new UnsupportedPhotoError();
    }
    if (inputWidth * inputHeight > MAX_INPUT_PIXELS) {
      throw new UnsupportedPhotoError("Photo has too many pixels");
    }

    // Decode the original only once (the expensive step). The small copy is made from
    // the 1600 px WebP, which is already upright and much cheaper to decode.
    const large = await resizeTo(input, LARGE_SIDE, true);
    const small = await resizeTo(large, SMALL_SIDE, false);
    const largeMetadata = await sharp(large, SHARP_OPTIONS).metadata();
    const width = largeMetadata.width;
    const height = largeMetadata.height;
    if (width === undefined || height === undefined) {
      throw new UnsupportedPhotoError();
    }
    return { large, small, width, height };
  } catch (error) {
    if (error instanceof UnsupportedPhotoError) {
      throw error;
    }
    // sharp throws plain errors for corrupt files or formats it can't decode. We keep the
    // original error as `cause` so it shows up in logs when debugging.
    throw new UnsupportedPhotoError("Unsupported photo", { cause: error });
  }
}

async function resizeTo(
  input: Buffer,
  longestSide: number,
  applyRotation: boolean,
): Promise<Buffer> {
  let pipeline = sharp(input, SHARP_OPTIONS);
  if (applyRotation) {
    pipeline = pipeline.rotate();
  }
  return pipeline
    .resize({
      width: longestSide,
      height: longestSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}

/** The sizes a shop's logo (square) and banner (wide, 3:1) are cut to. */
export const SHOP_IMAGE_SIZES = {
  logo: { width: 400, height: 400 },
  banner: { width: 1500, height: 500 },
} as const;
export type ShopImageKind = keyof typeof SHOP_IMAGE_SIZES;

/**
 * A shop logo or banner: checked like product photos, then cut to its exact shape from the
 * middle of the picture ("cover": it fills the shape, the edges that don't fit are trimmed).
 */
export async function processShopImage(input: Buffer, kind: ShopImageKind): Promise<Buffer> {
  try {
    const metadata = await sharp(input, SHARP_OPTIONS).metadata();
    const format = metadata.format;
    if (format === undefined || !ALLOWED_FORMATS.includes(format)) {
      throw new UnsupportedPhotoError();
    }
    const size = SHOP_IMAGE_SIZES[kind];
    return await sharp(input, SHARP_OPTIONS)
      .rotate()
      .resize({ width: size.width, height: size.height, fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (error instanceof UnsupportedPhotoError) {
      throw error;
    }
    throw new UnsupportedPhotoError("Unsupported photo", { cause: error });
  }
}
