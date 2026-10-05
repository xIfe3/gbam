import sharp from "sharp";

const ALLOWED_FORMATS = ["jpeg", "png", "webp", "heif"];
const LARGE_SIDE = 1600;
const SMALL_SIDE = 400;

/** The file is not a photo we can read (wrong type, corrupt, or unsupported HEIC build). */
export class UnsupportedPhotoError extends Error {
  constructor(message = "Unsupported photo") {
    super(message);
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
    const metadata = await sharp(input).metadata();
    const format = metadata.format;
    if (format === undefined || !ALLOWED_FORMATS.includes(format)) {
      throw new UnsupportedPhotoError();
    }

    const large = await resizeTo(input, LARGE_SIDE);
    const small = await resizeTo(input, SMALL_SIDE);
    const largeMetadata = await sharp(large).metadata();
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
    // sharp throws plain errors for corrupt files or formats it can't decode.
    throw new UnsupportedPhotoError();
  }
}

async function resizeTo(input: Buffer, longestSide: number): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: longestSide,
      height: longestSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}
