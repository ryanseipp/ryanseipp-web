import rss from "@astrojs/rss";
import {getCollection} from "astro:content";
import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";

const parser = new MarkdownIt();

export async function GET(context) {
  const blog = await getCollection("blog", (entry) => !entry.data.draft);

  return rss({
    title: "Ryan Seipp | Blog",
    description: "A blog about software engineering, networking, and homelabs",
    site: context.site,
    items: blog
      .toSorted((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
      .map((post) => ({
        link: `/posts/${post.id}/`,
        ...post.data,
        author: "rseipp@ryanseipp.com (Ryan Seipp)",
        content: sanitizeHtml(parser.render(post.body ?? "")),
      })),
    stylesheet: "/rss/styles.xsl",
  });
}
