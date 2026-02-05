import { beforeEach, describe, expect, it, vi } from "vitest";
import { signalRpcRequest } from "./client.js";

const fetchMock = vi.fn();

vi.mock("../infra/fetch.js", () => ({
  resolveFetch: () => fetchMock,
}));

describe("signal client rpc", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result: {} }),
    });
  });

  it("unwraps recipient array for sendReceipt", async () => {
    await signalRpcRequest(
      "sendReceipt",
      { recipient: ["+15551234567"], targetTimestamp: 123456789 },
      { baseUrl: "http://localhost:8080", account: "+15550000000" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/receipts/%2B15550000000"), // Encoded account
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"recipient":"+15551234567"'),
      }),
    );
    // verify it does NOT contain array brackets for recipient
    expect(fetchMock.mock.calls[0][1].body).not.toContain(
      '"recipient":["+15551234567"]',
    );
  });

  it("handles sendReaction with array recipient (wrapper fix check)", async () => {
    // Checking if this logic also applies to other single-recipient endpoints just in case
    await signalRpcRequest(
      "sendReaction",
      { recipient: ["+15551234567"], emoji: ":thumbsup:" },
      { baseUrl: "http://localhost:8080", account: "+15550000000" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/reactions/%2B15550000000"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"recipient":"+15551234567"'),
      }),
    );
  });
});
