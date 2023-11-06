import rss from "@astrojs/rss";
import {getCollection} from "astro:content";
import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";

const parser = new MarkdownIt();

export async function GET(context) {
  const blog = await getCollection("blog");

  return rss({
    xmlns: {atom: "http://www.w3.org/2005/Atom"},
    title: "Ryan Seipp | Blog",
    description: "A blog about software engineering, networking, and homelabs",
    site: "http://localhost:4321/",
    author: "Ryan Seipp",
    source: {
      title: "Ryan Seipp | Blog RSS Feed",
      url: "http://localhost:4321/rss.xml",
    },
    items: blog.map((post) => ({
      link: `/post/${post.slug}/`,
      ...post.data,
      content: sanitizeHtml(parser.render(post.body)),
    })),
    customData: `<atom:link href="http://localhost:4321/rss.xml" rel="self" type="application/rss+xml" />`,
    stylesheet: "/rss/styles.xsl",
  });
}
