import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, API_BASE_URL, request, WS_BASE_URL } from "@/lib/api";

function mockFetch(response: Partial<Response> | Error | DOMException) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error || response instanceof DOMException) throw response;
    return response as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("uses one base URL for HTTP and WebSocket", () => {
    expect(API_BASE_URL).toBe("http://localhost:8000");
    expect(WS_BASE_URL).toBe("ws://localhost:8000");
  });

  it("returns parsed JSON on success", async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({ status: "ok" }) });
    await expect(api.health()).resolves.toEqual({ status: "ok" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/health");
  });

  it("builds query strings and skips empty values", async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({}) });
    await api.samples({ search: "kepler 5", disposition: "", split: "test", page: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/dataset/samples?search=kepler+5&split=test&page=2");
  });

  it("encodes sample ids in the path", async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({}) });
    await api.sample("K00002.01/../x", { mode: "raw" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/dataset/samples/K00002.01%2F..%2Fx?mode=raw");
  });

  it("turns the backend error envelope into an ApiError", async () => {
    mockFetch({ ok: false, status: 409, json: async () => ({ error: { code: "model_not_trained", message: "No trained model.", details: null } }) });
    const err = await api.predictSample("K1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "model_not_trained", message: "No trained model." });
  });

  it("copes with a non-JSON error body", async () => {
    mockFetch({ ok: false, status: 502, json: async () => { throw new Error("not json"); } });
    await expect(request("/x")).rejects.toMatchObject({ status: 502, code: "http_error" });
  });

  it("reports an unreachable backend", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(api.health()).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("reports a timeout separately", async () => {
    mockFetch(new DOMException("timed out", "TimeoutError"));
    await expect(api.health()).rejects.toMatchObject({ code: "timeout" });
  });

  it("sends uploads as multipart form data without empty fields", async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({}) });
    await api.predictUpload(new File(["time,flux\n1,2"], "lc.csv"), { flux_column: "flux", time_column: null, period: 2.5 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(init.method).toBe("POST");
    expect([...form.keys()].sort()).toEqual(["file", "flux_column", "period"]);
    expect(form.get("period")).toBe("2.5");
  });
});
