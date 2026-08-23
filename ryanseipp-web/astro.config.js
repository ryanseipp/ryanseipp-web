import {defineConfig, fontProviders, svgoOptimizer} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";
import {satteri} from "@astrojs/markdown-satteri";
import {mdastReadingTime} from "./src/mdast/reading-time";
import mdx from "@astrojs/mdx";
import playformCompress from "@playform/compress";

// https://astro.build/config
export default defineConfig({
    integrations: [mdx(), sitemap(), robotsTxt(), playformCompress()],
    site: "https://ryanseipp.com",
    prefetch: true,
    fonts: [
        {
            provider: fontProviders.fontsource(),
            name: "Inter",
            cssVariable: "--font-inter",
            weights: ["100 900"],
            styles: ["normal"],
            fallbacks: ["sans-serif"],
        },
        {
            provider: fontProviders.fontsource(),
            name: "Source Code Pro",
            cssVariable: "--font-source-code-pro",
            weights: ["200 900"],
            styles: ["normal"],
            fallbacks: ["monospace"],
        },
    ],
    markdown: {
        processor: satteri({mdastPlugins: [mdastReadingTime]}),
        shikiConfig: {
            themes: {
                light: "catppuccin-latte",
                dark: "catppuccin-mocha",
            },
        },
    },
    experimental: {
        svgOptimizer: svgoOptimizer(),
    },
    vite: {
        plugins: [tailwindcss()],
    },
});
