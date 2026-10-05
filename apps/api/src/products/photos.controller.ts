import { PRODUCT_LIMITS } from "@gbam/shared";
import {
  BadRequestException,
  Catch,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { PhotosService } from "./photos.service.js";

/**
 * multer (the upload parser) refuses huge files itself with its own wording. This filter
 * swaps in our message so the seller always sees the same sentence.
 */
@Catch(PayloadTooLargeException)
export class PhotoTooLargeFilter implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(413).json({ statusCode: 413, message: "Photos can be up to 10 MB" });
  }
}

@Controller("products/images")
@UseGuards(SessionGuard)
@UseFilters(PhotoTooLargeFilter)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  // Multipart upload: FileInterceptor reads the form field "photo" into memory. The limit
  // is one byte over 10 MB so a file of exactly 10 MB passes and the service does the
  // exact check.
  @Post()
  @UseInterceptors(
    FileInterceptor("photo", {
      limits: { fileSize: PRODUCT_LIMITS.maxPhotoBytes + 1, files: 1, fields: 5, parts: 6 },
    }),
  )
  async upload(
    @CurrentSellerId() sellerId: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("Choose a photo to upload");
    }
    return this.photos.upload(sellerId, file);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentSellerId() sellerId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.photos.deleteUnattached(sellerId, id);
  }
}
