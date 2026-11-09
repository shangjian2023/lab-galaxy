import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/knowledge/tasks/route";
import { getCurrentViewer } from "./server-auth";

vi.mock("./auth-http", () => ({
  checkSameOrigin: () => null,
  readJsonObject: async (request: Request) => await request.json(),
}));
vi.mock("./server-auth", () => ({ getCurrentViewer: vi.fn() }));
vi.mock("./server-env", () => ({ getModelConfig: () => ({ baseUrl: "unused", model: "qwen-test", apiKey: "unused" }) }));

const viewer = vi.mocked(getCurrentViewer);

beforeEach(() => {
  viewer.mockResolvedValue({ id: "user-alice", role: "member" });
});

function request(body: unknown) {
  return new Request("http://localhost/api/knowledge/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("knowledge extraction API guards", () => {
  it("requires explicit cost confirmation", async () => {
    const response = await POST(request({ documentId: "doc", maxChunks: 4 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "COST_CONFIRMATION_REQUIRED" });
  });

  it("rejects chunk limits above eight", async () => {
    const response = await POST(request({ documentId: "doc", confirmCost: true, maxChunks: 9 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_MAX_CHUNKS" });
  });
});
