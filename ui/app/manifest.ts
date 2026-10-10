import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MoneyMind - Personal Finance Manager",
    short_name: "MoneyMind",
    description: "Take control of your finances with MoneyMind",
    start_url: "/overview/dashboard",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#2563EB",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
