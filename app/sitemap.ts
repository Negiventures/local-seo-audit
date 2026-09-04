import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * One page, because that is how many there are.
 *
 * Worth having anyway: Search Console wants a sitemap to confirm what is
 * canonical, and listing the one URL is what stops it guessing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
