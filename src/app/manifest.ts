import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "UFace",
    short_name: "UFace",
    description:
      "Photo-based grooming guidance with local face measurements, personalized AI advice, and device-local progress.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#1b192e",
    theme_color: "#1b192e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
