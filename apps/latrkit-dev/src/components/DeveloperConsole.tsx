"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  CreateDeveloperApiKeyResponse,
  DeveloperApiKeySummary,
  DeveloperClientSummary,
  DeveloperUsageSummary,
} from "latr-packages/gateway-client";
import {
  createDeveloperApiKey,
  createDeveloperClient,
  createOfficialDeveloperClient,
  deleteDeveloperClient,
  listDeveloperApiKeys,
  listDeveloperClients,
  listDeveloperUsage,
  revokeDeveloperApiKey,
} from "latr-web-client/developerGatewayClient";

import { useAuth } from "@/hooks/useAuth";
import { officialProvisionerDid } from "@/lib/environmentBanner";

export function DeveloperConsole() {
  const { session, getOAuthSession, signOut } = useAuth();
  const [clients, setClients] = useState<DeveloperClientSummary[]>([]);
  const [usage, setUsage] = useState<DeveloperUsageSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [keys, setKeys] = useState<DeveloperApiKeySummary[]>([]);
  const [newClientId, setNewClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [officialClientId, setOfficialClientId] = useState("");
  const [officialClientName, setOfficialClientName] = useState("");
  const [revealedKey, setRevealedKey] = useState<CreateDeveloperApiKeyResponse | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const officialDid = officialProvisionerDid();
  const canProvisionOfficial =
    Boolean(officialDid) && session?.did === officialDid;

  const refresh = useCallback(async () => {
    const oauth = getOAuthSession();
    if (!oauth) return;
    setError(null);
    const [nextClients, nextUsage] = await Promise.all([
      listDeveloperClients(oauth),
      listDeveloperUsage(oauth),
    ]);
    setClients(nextClients);
    setUsage(nextUsage);
  }, [getOAuthSession]);

  const refreshKeys = useCallback(
    async (clientId: string) => {
      const oauth = getOAuthSession();
      if (!oauth) return;
      const nextKeys = await listDeveloperApiKeys(oauth, clientId);
      setKeys(nextKeys);
    },
    [getOAuthSession]
  );

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load console data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedClientId) {
      setKeys([]);
      return;
    }
    refreshKeys(selectedClientId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    });
  }, [selectedClientId, refreshKeys]);

  async function handleCreateClient(e: FormEvent) {
    e.preventDefault();
    const oauth = getOAuthSession();
    if (!oauth) return;
    setError(null);
    try {
      await createDeveloperClient(oauth, {
        clientId: newClientId.trim(),
        displayName: newClientName.trim() || undefined,
      });
      setNewClientId("");
      setNewClientName("");
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    }
  }

  async function handleCreateOfficial(e: FormEvent) {
    e.preventDefault();
    const oauth = getOAuthSession();
    if (!oauth) return;
    setError(null);
    try {
      const created = await createOfficialDeveloperClient(oauth, {
        clientId: officialClientId.trim(),
        displayName: officialClientName.trim() || undefined,
      });
      setRevealedKey(created);
      setOfficialClientId("");
      setOfficialClientName("");
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to provision official client");
    }
  }

  async function handleCreateKey() {
    if (!selectedClientId) return;
    const oauth = getOAuthSession();
    if (!oauth) return;
    setError(null);
    try {
      const created = await createDeveloperApiKey(oauth, selectedClientId);
      setRevealedKey(created);
      await refreshKeys(selectedClientId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading developer console…</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-semibold">LatrKit Developer Console</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Signed in as <code className="text-xs">{session?.did}</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
        >
          Sign out
        </button>
      </header>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {revealedKey ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="font-medium text-amber-900 dark:text-amber-100">API key (shown once)</h2>
          <p className="mt-2 font-mono text-sm break-all">{revealedKey.apiKey}</p>
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Use headers <code>X-Latr-Client-Id: {revealedKey.clientId}</code> and{" "}
            <code>X-Latr-API-Key</code> on gateway requests.
          </p>
          <button
            type="button"
            className="mt-3 text-sm underline"
            onClick={() => setRevealedKey(null)}
          >
            Dismiss
          </button>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your clients</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {clients.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">No clients yet.</li>
          ) : (
            clients.map((client) => (
              <li key={client.clientId} className="flex items-center justify-between px-4 py-3">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setSelectedClientId(client.clientId)}
                >
                  <span className="font-medium">{client.clientId}</span>
                  <span className="ml-2 text-xs text-zinc-500">{client.kind}</span>
                </button>
                {client.kind === "developer" ? (
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() =>
                      void deleteDeveloperClient(getOAuthSession()!, client.clientId).then(
                        refresh
                      )
                    }
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Create developer client</h2>
        <form onSubmit={handleCreateClient} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={newClientId}
            onChange={(e) => setNewClientId(e.target.value)}
            placeholder="client-id"
            required
            pattern="[a-z][a-z0-9-]{0,62}"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <input
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            placeholder="Display name (optional)"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-zinc-900 text-sm font-medium text-white sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Create client
          </button>
        </form>
      </section>

      {canProvisionOfficial ? (
        <section className="rounded-lg border border-violet-300 p-4 dark:border-violet-800">
          <h2 className="text-lg font-medium">Official clients (provisioner)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Internal first-party integrations (L@tr.link, The Social Wire, …).
          </p>
          <form onSubmit={handleCreateOfficial} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={officialClientId}
              onChange={(e) => setOfficialClientId(e.target.value)}
              placeholder="latr-link-web"
              required
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
            <input
              value={officialClientName}
              onChange={(e) => setOfficialClientName(e.target.value)}
              placeholder="Display name"
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
            <button
              type="submit"
              className="h-10 rounded-md bg-violet-700 text-sm font-medium text-white sm:col-span-2"
            >
              Provision official client + key
            </button>
          </form>
        </section>
      ) : null}

      {selectedClientId ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">API keys for {selectedClientId}</h2>
            <button
              type="button"
              onClick={() => void handleCreateKey()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Create key
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {keys.map((key) => (
              <li
                key={key.keyId}
                className="flex items-center justify-between rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-900"
              >
                <span>
                  {key.label ?? key.keyId}{" "}
                  {key.revokedAt ? (
                    <span className="text-red-600">revoked</span>
                  ) : (
                    <span className="text-green-700 dark:text-green-400">active</span>
                  )}
                </span>
                {!key.revokedAt ? (
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() =>
                      void revokeDeveloperApiKey(
                        getOAuthSession()!,
                        selectedClientId,
                        key.keyId
                      ).then(() => refreshKeys(selectedClientId))
                    }
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Usage (preview)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Billing via Stripe is not enabled yet. Limits apply in developer preview.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {usage.map((row) => (
            <li key={row.clientId} className="rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
              <strong>{row.clientId}</strong> — {row.usageDate}
              {row.dailyLimit != null ? (
                <span className="ml-2 text-zinc-500">
                  {row.remaining ?? 0} / {row.dailyLimit} remaining
                </span>
              ) : null}
              <ul className="mt-1 text-xs text-zinc-500">
                {row.buckets.map((bucket) => (
                  <li key={bucket.routeFamily}>
                    {bucket.routeFamily}: {bucket.requestCount}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
