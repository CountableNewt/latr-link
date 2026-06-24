#!/usr/bin/env node
/**
 * Prints OAuth redirect URIs to add to extension client-metadata.json.
 * Load the unpacked extension in Chromium, then run with its extension id:
 *   node apps/extension/scripts/print-redirect-uri.mjs <chrome-extension-id>
 */
const id = process.argv[2]?.trim();
if (!id) {
  console.error(
    "Usage: node apps/extension/scripts/print-redirect-uri.mjs <chrome-extension-id>"
  );
  process.exit(1);
}

const chromiumAppOrg = `https://${id}.chromiumapp.org/callback.html`;
const chromeExtension = `chrome-extension://${id}/callback.html`;

console.log("Add these redirect_uris to client-metadata.json:\n");
console.log(chromiumAppOrg);
console.log(chromeExtension);
