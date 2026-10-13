// Firefox exposes browser.*; Chromium uses the promise-based chrome.* API.
export const extension: typeof chrome = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;
