import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://minimaltolerance.com",
  trailingSlash: "always",

  integrations: [sitemap()],

  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
