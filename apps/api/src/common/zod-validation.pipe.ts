import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { z, type ZodType } from "zod";

/** Validates a body/query with a schema from @gbam/shared: `@Body(new ZodPipe(schema))`. */
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
