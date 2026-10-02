import { InvalidOrderTransitionError } from "@gbam/shared";
import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

/** Maps state-machine violations to 409 so controllers don't need try/catch. */
@Catch(InvalidOrderTransitionError)
export class DomainErrorsFilter implements ExceptionFilter {
  catch(error: InvalidOrderTransitionError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(409).json({
      statusCode: 409,
      error: "InvalidOrderTransition",
      message: error.message,
      from: error.from,
      to: error.to,
    });
  }
}
