import type { Page } from "@playwright/test";

/**
 * Page content lives in #main. React 19 briefly keeps streamed Suspense content twice in the DOM
 * (a hidden copy plus the visible one), so page-level locators are scoped to #main to stay strict.
 * Toasts, dialogs and the sidebar/top bar live outside #main and use `page` directly.
 */
export const main = (page: Page) => page.locator("#main");
