import type { MetadataRoute } from "next";

// Absolute base for the sitemap directive. Same resolution as the root
// layout metadata: explicit site URL wins, then the Vercel production
// domain; localhost is dev-only. Set NEXT_PUBLIC_SITE_URL in production.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null) ??
  "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/pricing"],
        // JSON API + single-use token flows must never be crawled.
        disallow: ["/api/", "/magic-link/verify"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
