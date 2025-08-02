import { test, expect } from "bun:test";
import { checkBasicChallenge } from "~/util/browserChallenge";
import { Socket } from "~/ws/Socket";

test("Basic browser challenge is completed correctly", () => {
    const socket = new Socket();
    const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
    const code = btoa(JSON.stringify([true, userAgent]));
    checkBasicChallenge(socket, code);
    expect(socket.gateway.hasCompletedBrowserChallenge).toBe(true);
    expect(socket.gateway.userAgent).toBe(userAgent);
});

test("Obfuscated browser challenge is completed correctly (not implemented yet)", () => {});
