import {defineConfig} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";
import {remarkReadingTime} from "./src/remark/reading-time.mjs";
import mdx from "@astrojs/mdx";
import playformCompress from "@playform/compress";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx(), sitemap(), robotsTxt(), playformCompress()],
  site: "https://ryanseipp.com",
  prefetch: true,
  markdown: {
    remarkPlugins: [remarkReadingTime],
    shikiConfig: {
      themes: {
        light: "catppuccin-latte",
        dark: "catppuccin-mocha",
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          assetFileNames: (asset) =>
            asset.names?.some((n) => n.endsWith(".css")) &&
            asset.names?.some((n) => n.startsWith("about"))
              ? "_astro/base-[hash][extname]"
              : "_astro/[name]-[hash][extname]",
        },
      },
    },
  },
});
