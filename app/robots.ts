import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Search engines are welcome everywhere except the API routes, which return
 * JSON to this app and nothing a person would want in a result page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
