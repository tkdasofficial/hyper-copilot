export const SITE_URL = "https://hypercopilot.vercel.app";
export const SITE_NAME = "Hyper Copilot";
export const AUTHOR = "Tushar Kanti Das";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

/** Terms every page should compete for, regardless of topic. */
export const BASE_KEYWORDS = [
  "Hyper Copilot",
  "HyperCopilot",
  "Hyper Copilot AI",
  "Tushar Kanti Das",
  "AI generator",
  "multi-modal AI",
  "generative AI platform",
  "AI content creation tool",
  "free AI generator online",
  "best AI creative studio",
  "text to image AI",
  "text to video AI",
  "AI voice generator",
  "AI influencer generator",
];

type HeadInput = {
  /** Route path, e.g. "/pricing". Used for canonical + og:url. */
  path: string;
  title: string;
  description: string;
  /** Page-specific search terms; merged with BASE_KEYWORDS. */
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  /** Private / utility pages that should stay out of the index. */
  noindex?: boolean;
  /** Extra JSON-LD graph nodes for this page. */
  jsonLd?: Record<string, unknown>[];
  /** Breadcrumb trail beyond Home, e.g. [{ name: "Pricing", path: "/pricing" }]. */
  breadcrumbs?: { name: string; path: string }[];
};

export function pageHead(input: HeadInput) {
  const url = `${SITE_URL}${input.path === "/" ? "/" : input.path}`;
  const ogTitle = input.ogTitle ?? input.title;
  const ogDescription = input.ogDescription ?? input.description;
  const keywords = Array.from(new Set([...(input.keywords ?? []), ...BASE_KEYWORDS])).join(", ");

  const meta: Record<string, string>[] = [
    { title: input.title },
    { name: "description", content: input.description },
    { name: "keywords", content: keywords },
    { name: "author", content: AUTHOR },
    {
      name: "robots",
      content: input.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1",
    },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_US" },
    { property: "og:title", content: ogTitle },
    { property: "og:description", content: ogDescription },
    { property: "og:type", content: input.ogType ?? "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: `${SITE_NAME} — ${ogTitle}` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: ogTitle },
    { name: "twitter:description", content: ogDescription },
    { name: "twitter:image", content: OG_IMAGE },
  ];

  const breadcrumbItems = [{ name: "Home", path: "/" }, ...(input.breadcrumbs ?? [])];
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: input.title,
      description: input.description,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      author: { "@type": "Person", name: AUTHOR },
      publisher: { "@type": "Person", name: AUTHOR },
    },
    ...(breadcrumbItems.length > 1
      ? [
          {
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbItems.map((b, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: b.name,
              item: `${SITE_URL}${b.path === "/" ? "/" : b.path}`,
            })),
          },
        ]
      : []),
    ...(input.jsonLd ?? []),
  ];

  return {
    meta,
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      },
    ],
  };
}
