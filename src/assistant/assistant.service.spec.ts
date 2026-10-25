import {
  BadGatewayException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { AssistantService } from "./assistant.service";

describe("AssistantService", () => {
  const config = (env: Record<string, string | undefined>) =>
    ({ get: (k: string) => env[k] }) as any;
  const urls = {
    N8N_GUEST_CHAT_URL: "https://n8n.test/webhook/guest/chat",
    N8N_STAFF_WEBHOOK_URL: "https://n8n.test/webhook/staff",
  };
  const respond = (status: number, body: unknown) =>
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));

  afterEach(() => jest.restoreAllMocks());

  it("sends the guest message as an n8n chat message and returns the reply", async () => {
    const fetchSpy = respond(200, { output: "We have three room types." });
    const res = await new AssistantService(config(urls)).askGuest(
      "abc12345",
      "What rooms do you have?",
    );
    expect(res).toEqual({ reply: "We have three room types." });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(urls.N8N_GUEST_CHAT_URL);
    expect(JSON.parse(init!.body as string)).toEqual({
      action: "sendMessage",
      sessionId: "web:abc12345",
      chatInput: "What rooms do you have?",
    });
  });

  it("forwards the staff member's own login to the staff assistant", async () => {
    const fetchSpy = respond(200, { reply: "Room 201 is late." });
    const res = await new AssistantService(config(urls)).askStaff(
      "Bearer token-123",
      "s1234567",
      "What's late?",
    );
    expect(res).toEqual({ reply: "Room 201 is late." });
    const init = fetchSpy.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer token-123",
    );
  });

  it("passes a rejected login back as 401", async () => {
    respond(401, { error: "Please sign in" });
    await expect(
      new AssistantService(config(urls)).askStaff("Bearer x", "s1234567", "hi"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("answers 502 when n8n fails or is unreachable", async () => {
    respond(500, { message: "Error in workflow" });
    await expect(
      new AssistantService(config(urls)).askGuest("abc12345", "hi"),
    ).rejects.toThrow(BadGatewayException);

    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      new AssistantService(config(urls)).askGuest("abc12345", "hi"),
    ).rejects.toThrow(BadGatewayException);
  });

  it("answers 503 when the assistant isn't configured", async () => {
    const saved = process.env.N8N_GUEST_CHAT_URL;
    delete process.env.N8N_GUEST_CHAT_URL;
    await expect(
      new AssistantService(config({})).askGuest("abc12345", "hi"),
    ).rejects.toThrow(ServiceUnavailableException);
    process.env.N8N_GUEST_CHAT_URL = saved;
  });
});
