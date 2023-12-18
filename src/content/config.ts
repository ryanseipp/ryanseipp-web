import {defineCollection, z} from "astro:content";

const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = MS_IN_SECOND * 60;

const blogCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date({coerce: true}).transform(
      // Make date TZ-independent
      (date) =>
        new Date(date.getTime() + date.getTimezoneOffset() * MS_IN_MINUTE),
    ),
    categories: z.array(z.string()).optional(),
    draft: z.boolean().optional(),
  }),
});

export const collections = {
  blog: blogCollection,
};
