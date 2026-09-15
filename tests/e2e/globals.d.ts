/**
 * End-to-end tests evaluate code inside the browser, where `chrome` is the
 * real extension API rather than WXT's wrapper.
 */
declare const chrome: typeof import('wxt/browser').browser;
