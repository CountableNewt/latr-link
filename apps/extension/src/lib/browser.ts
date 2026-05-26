/** Resolve OAuth redirect URI for the current browser extension runtime. */
export function resolveExtensionRedirectUri(): string {
  const chromeApi = (
    globalThis as typeof globalThis & {
      chrome?: { identity?: { getRedirectURL?: (path?: string) => string } };
    }
  ).chrome;

  if (chromeApi?.identity?.getRedirectURL) {
    return chromeApi.identity.getRedirectURL("callback.html");
  }

  return browser.runtime.getURL("/callback.html");
}

export async function getActiveTabUrl(): Promise<string | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url?.trim();
  return url && url.length > 0 ? url : null;
}
