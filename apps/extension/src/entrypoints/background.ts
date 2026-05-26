import { saveTabUrl } from "../lib/save";
import { getExtensionSession } from "../lib/auth";
import { getActiveTabUrl } from "../lib/browser";
import { syncExtensionGatewayConfig } from "../lib/config";

export default defineBackground(() => {
  syncExtensionGatewayConfig();

  browser.contextMenus.create({
    id: "latr-save-page",
    title: "Save to L@tr.link",
    contexts: ["page", "link"],
  });

  async function saveActiveTabFromBackground(): Promise<void> {
    const session = await getExtensionSession();
    if (!session) {
      await browser.action.openPopup?.();
      return;
    }
    const url = await getActiveTabUrl();
    if (!url) return;
    const result = await saveTabUrl(url, session);
    if (!result.ok) {
      console.warn("[latr-extension]", result.message);
    }
  }

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "latr-save-page") return;
    void (async () => {
      const session = await getExtensionSession();
      if (!session) {
        await browser.action.openPopup?.();
        return;
      }
      const url =
        info.linkUrl?.trim() ||
        info.pageUrl?.trim() ||
        tab?.url?.trim() ||
        (await getActiveTabUrl());
      if (!url) return;
      const result = await saveTabUrl(url, session);
      if (!result.ok) {
        console.warn("[latr-extension]", result.message);
      }
    })();
  });

  browser.commands?.onCommand.addListener((command) => {
    if (command !== "save-current-tab") return;
    void saveActiveTabFromBackground();
  });
});
