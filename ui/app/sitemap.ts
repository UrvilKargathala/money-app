import type { MetadataRoute } from "next";

// Indexable public surface only: utility + token pages (forgot-password,
// reset-password, verify-email, magic-link) are deliberately excluded —
// they inherit noindex from the (auth) segment layout.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "/", lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: "/pricing", lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: "/login", lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: "/signup", lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
