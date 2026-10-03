import { Controller, Get, Param } from "@nestjs/common";
import { ContentService } from "./content.service.js";

/** Public (no login): help articles, FAQ, blog, changelog and legal pages. */
@Controller("content")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get(":type")
  list(@Param("type") type: string) {
    return this.content.list(type);
  }

  @Get(":type/:slug")
  get(@Param("type") type: string, @Param("slug") slug: string) {
    return this.content.get(type, slug);
  }
}
