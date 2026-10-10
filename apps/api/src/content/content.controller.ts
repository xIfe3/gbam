import { Controller, Get, Param } from "@nestjs/common";
import { ContentService } from "./content.service.js";

/** Public (no login): help articles, FAQ, blog, changelog and legal pages. */
@Controller("content")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /**
   * A marketing page's words and photos: the published ones, today's defaults for the rest.
   * Declared before ":type/:slug" so "marketing" isn't read as a content type.
   */
  @Get("marketing/:page")
  marketing(@Param("page") page: string) {
    return this.content.marketing(page);
  }

  @Get(":type")
  list(@Param("type") type: string) {
    return this.content.list(type);
  }

  @Get(":type/:slug")
  get(@Param("type") type: string, @Param("slug") slug: string) {
    return this.content.get(type, slug);
  }
}
