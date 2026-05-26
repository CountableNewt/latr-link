import { handleExtensionOAuthCallback } from "../../lib/auth";

void (async () => {
  const status = document.getElementById("status");
  try {
    await handleExtensionOAuthCallback();
    if (status) status.textContent = "Signed in. You can close this tab.";
    setTimeout(() => window.close(), 1200);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAuth callback failed.";
    if (status) status.textContent = message;
  }
})();
