import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { ThemeProvider } from "../components/hyper/ThemeProvider";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hyper Copilot — Multi-Modal AI Generator" },
      {
        name: "description",
        content:
          "Built by Tushar Kanti Das, Hyper Copilot is an all-in-one multi-modal AI platform for image, video, audio, and AI influencer creation.",
      },
      { name: "robots", content: "index, follow" },
      {
        name: "googlebot",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { name: "author", content: "Tushar Kanti Das" },
      { name: "creator", content: "Tushar Kanti Das" },
      { name: "publisher", content: "Tushar Kanti Das" },
      { name: "theme-color", content: "#111111" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Hyper Copilot" },
      // Open Graph Tags
      { property: "og:site_name", content: "Hyper Copilot" },
      { property: "og:locale", content: "en_US" },
      { property: "og:title", content: "Hyper Copilot — Multi-Modal AI Generator" },
      {
        property: "og:description",
        content:
          "Built by Tushar Kanti Das, Hyper Copilot is an all-in-one multi-modal AI platform for image, video, audio, and AI influencer creation.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hypercopilot.vercel.app/" },
      // Twitter Card Meta Tags
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Hyper Copilot — Multi-Modal AI Generator" },
      {
        name: "twitter:description",
        content:
          "Built by Tushar Kanti Das, Hyper Copilot is an all-in-one multi-modal AI platform for image, video, audio, and AI influencer creation.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.json" },
    ],
    scripts: [
      // Schema.org Structured Data
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": "https://hypercopilot.vercel.app/#website",
              name: "Hyper Copilot",
              alternateName: "Hyper Copilot AI",
              url: "https://hypercopilot.vercel.app/",
              inLanguage: "en",
              description:
                "Built by Tushar Kanti Das, Hyper Copilot is an all-in-one multi-modal AI platform for image, video, audio, and AI influencer creation.",
              publisher: {
                "@type": "Person",
                name: "Tushar Kanti Das",
                url: "https://hypercopilot.vercel.app/",
              },
            },
            {
              "@type": "SoftwareApplication",
              "@id": "https://hypercopilot.vercel.app/#app",
              name: "Hyper Copilot",
              alternateName: "Hyper Copilot AI",
              url: "https://hypercopilot.vercel.app/",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "All",
              browserRequirements: "Requires a modern web browser with JavaScript enabled.",
              image: "https://hypercopilot.vercel.app/og-image.png",
              screenshot: "https://hypercopilot.vercel.app/og-image.png",
              description:
                "Built by Tushar Kanti Das, Hyper Copilot is an all-in-one multi-modal AI platform for image, video, audio, and AI influencer creation.",
              featureList: [
                "Text to image generation",
                "Text to video generation",
                "AI influencer and virtual model creation",
                "Voice and audio generation",
                "Vector and 3D drafts",
                "Generative fill and 8K upscaling",
              ],
              creator: { "@type": "Person", name: "Tushar Kanti Das" },
              author: { "@type": "Person", name: "Tushar Kanti Das" },
              publisher: {
                "@type": "Person",
                name: "Tushar Kanti Das",
                url: "https://hypercopilot.vercel.app/",
              },
              isPartOf: { "@id": "https://hypercopilot.vercel.app/#website" },
            },
          ],
        }),
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
