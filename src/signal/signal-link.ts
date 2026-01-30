import { resolveFetch } from "../infra/fetch.js";

export type SignalAccountInfo = {
  number: string;
  uuid: string | null;
};

export type SignalLinkStatus = {
  accounts: SignalAccountInfo[];
  linked: boolean;
};

/**
 * Get registered accounts from signal-cli-rest-api
 */
export async function getSignalAccounts(
  baseUrl: string,
): Promise<SignalAccountInfo[]> {
  const fetchImpl = resolveFetch();
  if (!fetchImpl) throw new Error("fetch is not available");

  const normalized = baseUrl.replace(/\/+$/, "");
  const res = await fetchImpl(`${normalized}/v1/accounts`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to get accounts: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter(
      (acc: unknown): acc is { number?: string; uuid?: string | null } =>
        typeof acc === "object" && acc !== null && "number" in acc,
    )
    .map((acc) => ({
      number: String(acc.number ?? ""),
      uuid: acc.uuid ?? null,
    }));
}

/**
 * Get QR code PNG for device linking from signal-cli-rest-api
 * @param baseUrl - Base URL of signal-cli-rest-api
 * @param deviceName - Name to show in Signal's linked devices list
 * @returns PNG image buffer
 */
export async function getSignalQrLinkPng(
  baseUrl: string,
  deviceName: string = "Clawdbot",
): Promise<Buffer> {
  const fetchImpl = resolveFetch();
  if (!fetchImpl) throw new Error("fetch is not available");

  const normalized = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${normalized}/v1/qrcodelink`);
  url.searchParams.set("device_name", deviceName);

  const res = await fetchImpl(url.toString(), {
    method: "GET",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Failed to get QR code: ${res.status} ${errorText || res.statusText}`,
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Check if a specific phone number is linked (has non-null UUID)
 */
export async function isAccountLinked(
  baseUrl: string,
  phoneNumber: string,
): Promise<boolean> {
  const accounts = await getSignalAccounts(baseUrl);
  const account = accounts.find((acc) => acc.number === phoneNumber);
  return Boolean(account?.uuid);
}

/**
 * Get full link status including all accounts and linked state
 */
export async function getSignalLinkStatus(
  baseUrl: string,
): Promise<SignalLinkStatus> {
  const accounts = await getSignalAccounts(baseUrl);
  const linked = accounts.some((acc) => acc.uuid !== null);
  return { accounts, linked };
}
