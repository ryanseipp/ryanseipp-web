import {defineConfig} from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";
import {remarkReadingTime} from "./src/remark/reading-time.mjs";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  integrations: [
    mdx(),
    tailwind({applyBaseStyles: false}),
    sitemap(),
    robotsTxt(),
  ],
  site: "https://ryanseipp.com",
  prefetch: true,
  markdown: {
    remarkPlugins: [remarkReadingTime],
    shikiConfig: {
      themes: {
        light: "light-plus",
        dark: "dark-plus",
      },
    },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          assetFileNames: (asset) =>
            asset.name.endsWith(".css") && asset.name.startsWith("about")
              ? "_astro/base-[hash][extname]"
              : "_astro/[name]-[hash][extname]",
        },
      },
    },
  },
});
