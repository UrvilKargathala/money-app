import type { MetadataRoute } from "next";

// Google requires absolute <loc> URLs. Same resolution as layout metadata
// and robots.ts. Set NEXT_PUBLIC_SITE_URL in production.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null) ??
  "http://localhost:3000";

// Indexable public surface only: utility + token pages (forgot-password,
// reset-password, verify-email, magic-link) are deliberately excluded —
// they inherit noindex from the (auth) segment layout.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const url = (path: string) => `${siteUrl}${path}`;
  return [
    { url: url("/"), lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: url("/pricing"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: url("/login"), lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: url("/signup"), lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
