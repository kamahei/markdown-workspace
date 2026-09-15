/**
 * markdown-it plugins that ship no types.
 *
 * Each takes the markdown-it instance and an options bag, which is all this
 * project needs from them.
 */
declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-deflist' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it';
  interface TaskListOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: TaskListOptions) => void;
  export default plugin;
}
