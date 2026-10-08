import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QuitaFondo — quita fondos en tu navegador",
    short_name: "QuitaFondo",
    description: "Quita el fondo de tus fotos con IA, 100% en tu navegador. Tus imágenes nunca salen de tu equipo.",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: "#121217",
    theme_color: "#121217",
    categories: ["photo", "graphics", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
