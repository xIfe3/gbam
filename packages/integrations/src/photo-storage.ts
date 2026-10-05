import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Stores product photos. Production uses Cloudflare R2; dev uses a local folder. */
export interface PhotoStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** The address a browser can load the photo from. */
  publicUrl(key: string): string;
}

/** Keys come from our own code, but we still refuse ones that could escape the folder. */
function assertSafeKey(key: string) {
  if (key.includes("..") || key.startsWith("/")) {
    throw new Error(`Unsafe photo key: ${key}`);
  }
}

/** "https://x.app/" and "https://x.app" must both give urls without "//" in them. */
function withoutTrailingSlash(url: string): string {
  let result = url;
  while (result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

/** Dev fallback: writes files under a local folder that the API serves at /photos. */
export class LocalPhotoStorage implements PhotoStorage {
  private readonly publicBaseUrl: string;

  constructor(
    private readonly folder: string,
    publicBaseUrl: string,
  ) {
    this.publicBaseUrl = withoutTrailingSlash(publicBaseUrl);
  }

  async put(key: string, body: Buffer, _contentType: string) {
    assertSafeKey(key);
    const filePath = path.join(this.folder, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  async delete(key: string) {
    assertSafeKey(key);
    const filePath = path.join(this.folder, key);
    // force: true means "no error if the file is already gone".
    await rm(filePath, { force: true });
  }

  publicUrl(key: string) {
    return `${this.publicBaseUrl}/${key}`;
  }
}

export type R2PhotoStorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public address of the bucket, e.g. https://photos.gbam.app (no trailing slash). */
  publicBaseUrl: string;
};

/** Cloudflare R2 speaks the S3 protocol, so we use the S3 client pointed at R2. */
export class R2PhotoStorage implements PhotoStorage {
  private readonly client: S3Client;

  constructor(private readonly config: R2PhotoStorageConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 does not understand the extra checksums newer AWS SDK versions add by default,
      // so only send or check them when an operation requires it.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Photo keys are never reused, so browsers and the CDN may cache them forever.
      CacheControl: "public, max-age=31536000, immutable",
    });
    await this.client.send(command);
  }

  async delete(key: string) {
    assertSafeKey(key);
    const command = new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key });
    await this.client.send(command);
  }

  publicUrl(key: string) {
    return `${withoutTrailingSlash(this.config.publicBaseUrl)}/${key}`;
  }
}
