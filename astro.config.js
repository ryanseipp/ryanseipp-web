import {defineConfig} from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";
import {remarkReadingTime} from "./src/remark/reading-time.mjs";

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), sitemap(), robotsTxt()],
  site: "https://ryanseipp.com",
  prefetch: true,
  markdown: {
    remarkPlugins: [remarkReadingTime],
    shikiConfig: {
      experimentalThemes: {
        light: "light-plus",
        dark: "dark-plus",
      },
    },
  },
});
