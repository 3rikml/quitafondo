import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { ModelDownloadDialog } from "@/components/editor-ui/ModelDownloadDialog";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  title: "QuitaFondo",
  description: "Quita fondos de imágenes 100% en tu navegador, sin subir nada a internet.",
  applicationName: "QuitaFondo",
  openGraph: {
    title: "QuitaFondo",
    description: "Quita fondos de imágenes 100% en tu navegador, sin subir nada a internet.",
    siteName: "QuitaFondo",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "QuitaFondo" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "QuitaFondo", statusBarStyle: "default" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QuitaFondo",
  url: siteUrl,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any (web browser)",
  inLanguage: ["es", "en"],
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description: "Remove image backgrounds 100% in your browser, without uploading anything.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#121217" },
    { media: "(prefers-color-scheme: dark)", color: "#121217" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      // Dark by default; the pre-paint script below switches to light only if the user chose it.
      className={`dark ${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Open the connections the AI models and the runtime come from, so the first download starts sooner. */}
        <link rel="preconnect" href="https://huggingface.co" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {/* Runs before first paint so a saved light-theme choice applies without a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <TooltipProvider delay={300}>
          <Toaster>{children}</Toaster>
          <ModelDownloadDialog />
        </TooltipProvider>
      </body>
    </html>
  );
}
