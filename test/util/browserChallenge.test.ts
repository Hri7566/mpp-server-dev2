import { describe, expect, test } from "bun:test";
import {
    BASIC_CHALLENGE_CODE,
    checkBasicChallenge,
    decodeChallengeAnswer
} from "~/util/browserChallenge";
import { Socket } from "~/ws/Socket";
import { catchUnhandled } from "../helpers";

/** Run the challenge code the way Client.js does, with a given user agent */
function solve(userAgent: string) {
    const body = BASIC_CHALLENGE_CODE.substring(1); // strip the "~"
    return new Function("navigator", body)({ userAgent }) as string;
}

function answer(code: string) {
    const socket = new Socket();
    checkBasicChallenge(socket, code);
    return socket.gateway;
}

const CHROME =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

describe("basic browser challenge", () => {
    test("a normal browser passes and its user agent is kept", () => {
        const gateway = answer(solve(CHROME));

        expect(gateway.hasCompletedBrowserChallenge).toBe(true);
        expect(gateway.userAgent).toBe(CHROME);
    });

    test("user agents outside Latin-1 no longer break the challenge", () => {
        // btoa() alone throws on these, which made Client.js send "broken"
        const agents = [
            `${CHROME} 微信/8.0`,
            `${CHROME} Яндекс`,
            `${CHROME} ✓ 🎹`
        ];

        for (const ua of agents) {
            const gateway = answer(solve(ua));
            expect(gateway.hasCompletedBrowserChallenge).toBe(true);
            expect(gateway.userAgent).toBe(ua);
        }
    });

    test("answers from the old challenge code still pass", () => {
        // Browsers may still have the old Client/challenge cached
        const old = btoa(JSON.stringify([true, CHROME]));
        const gateway = answer(old);

        expect(gateway.hasCompletedBrowserChallenge).toBe(true);
        expect(gateway.userAgent).toBe(CHROME);
    });

    test("old-style Latin-1 user agents decode correctly", () => {
        const ua = "Mozilla/5.0 Café";
        const old = btoa(JSON.stringify([true, ua]));

        expect(decodeChallengeAnswer(old)).toBe(JSON.stringify([true, ua]));
        expect(answer(old).userAgent).toBe(ua);
    });

    test('"broken", garbage and wrong answers fail without throwing', async () => {
        const bad = [
            "broken",
            "not base64!!",
            "",
            btoa("not json"),
            btoa(JSON.stringify([false, CHROME])),
            btoa(JSON.stringify({ 0: true })),
            btoa("null")
        ];

        const errors = await catchUnhandled(() => {
            for (const code of bad) {
                expect(answer(code).hasCompletedBrowserChallenge).toBe(false);
            }
        });

        expect(errors).toHaveLength(0);
    });

    test("a missing code fails", () => {
        const socket = new Socket();
        checkBasicChallenge(socket, undefined);
        expect(socket.gateway.hasCompletedBrowserChallenge).toBe(false);
    });
});

test("Obfuscated browser challenge is completed correctly (not implemented yet)", () => {});
