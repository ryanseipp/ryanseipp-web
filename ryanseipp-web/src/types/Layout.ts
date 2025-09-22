export type ArticleProps = {
  published_time?: string;
  modified_time?: string;
  tags?: string[];
};

export type LayoutProps = {
  title: string;
  description: string;
  article?: ArticleProps;
};
