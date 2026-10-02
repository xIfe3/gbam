import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { z, type ZodType } from "zod";

/**
 * Checks incoming data against a Zod schema from @gbam/shared before the controller
 * sees it. Usage: `@Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput`.
 * Invalid data → HTTP 400 listing what's wrong with each field.
 *
 * A "pipe" transforms or validates a value on its way into a controller method.
 * `<T extends ZodType>` means "works with any Zod schema T", and `z.output<T>` is the
 * type of the data that schema produces (e.g. the normalised phone number).
 */
export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: z.flattenError(result.error),
      });
    }
    return result.data;
  }
}
