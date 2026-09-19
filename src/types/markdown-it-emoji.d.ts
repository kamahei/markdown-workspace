/**
 * Types for `markdown-it-emoji`, which ships none of its own.
 *
 * Only the entry points this project uses. `full` rather than `light`,
 * measured rather than assumed: light carries 150 shortcodes and is missing
 * `:tada:`, `:rocket:`, `:bug:`, `:memo:` and `:+1:` — nearly everything
 * anyone writes in a README. A viewer that renders some shortcodes and
 * leaves others as literal text looks broken in a way that rendering none
 * of them does not.
 *
 * The cost of `full` was measured at the same time: the initial reader
 * bundle goes from 97.0 to 113.8 KB gzip, against a 300 KB budget. If that
 * budget ever tightens, this is the first thing to reconsider.
 */
declare module 'markdown-it-emoji' {
  import type { PluginSimple } from 'markdown-it';

  export const full: PluginSimple;
  export const light: PluginSimple;
  export const bare: PluginSimple;
}
