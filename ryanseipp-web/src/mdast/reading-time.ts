import getReadingTime from "reading-time";
import {defineMdastPlugin} from "satteri";

export const mdastReadingTime = defineMdastPlugin({
  name: "mdast-reading-time",
  after(root, context) {
    const readingTime = getReadingTime(context.textContent(root));

    if (context.data.astro !== undefined) {
      context.data.astro.frontmatter.minutesRead = readingTime.text;
    }
  },
});
