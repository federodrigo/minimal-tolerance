import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://minimaltolerance.com",
  trailingSlash: "always",

  integrations: [
    sitemap({
      // Static PDFs are not discovered from Astro page routes.
      customPages: [
        "https://minimaltolerance.com/books/a-theory-of-minimal-tolerance.pdf",
        "https://minimaltolerance.com/books/una-teoria-de-tolerancia-minima.pdf",
      ],
    }),
  ],

  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
