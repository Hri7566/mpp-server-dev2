import type { Socket } from "~/ws/Socket";
import { config as partConfig } from "~/participant/config";
import { Logger } from "./Logger";

const logger = new Logger("Browser Challenge Handler");

/**
 * Code sent to the client in the "b" message for the basic challenge.
 *
 * The answer is base64 of the UTF-8 bytes of `[true, userAgent]`.
 * Plain btoa() only accepts Latin-1, so browsers with other characters in
 * their user agent used to throw, send "broken", and get kicked as bots.
 */
export const BASIC_CHALLENGE_CODE =
    "~const bytes = new TextEncoder().encode(JSON.stringify([true, navigator.userAgent]));" +
    ' let binary = "";' +
    " for (const b of bytes) binary += String.fromCharCode(b);" +
    " return btoa(binary);";

/** What Client.js sends when running the challenge code threw */
const BROKEN_CODE = "broken";

export function checkChallenge(socket: Socket, code?: string) {
    if (partConfig.browserChallenge === "none")
        socket.gateway.hasCompletedBrowserChallenge = true;
    if (partConfig.browserChallenge === "basic")
        checkBasicChallenge(socket, code);
    if (partConfig.browserChallenge === "obf") checkObfChallenge(socket, code);
}

/**
 * Decode a base64 challenge answer
 *
 * New clients send UTF-8; clients with the old challenge code cached send
 * Latin-1. Plain ASCII is the same in both.
 * @param code Base64 text
 * @returns Decoded text (throws on invalid base64)
 */
export function decodeChallengeAnswer(code: string) {
    const binary = atob(code);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        // Not valid UTF-8, so it's the old Latin-1 answer
        return binary;
    }
}

export function checkBasicChallenge(socket: Socket, code?: string) {
    if (typeof code !== "string") return;

    if (code === BROKEN_CODE) {
        // The challenge code threw on the client (no navigator, blocked eval...)
        logger.warn(
            `Client ${socket.ip} couldn't run the browser challenge (sent "broken")`
        );
        return;
    }

    let arr: unknown;

    try {
        arr = JSON.parse(decodeChallengeAnswer(code));
    } catch (err) {
        // Expected for garbage input, no need for a stack trace
        logger.warn(
            `Invalid browser challenge answer from ${socket.ip}:`,
            String(err)
        );
        return;
    }

    // Is the first element true?
    if (Array.isArray(arr) && arr[0] === true) {
        // They have completed the challenge (dumb)
        socket.gateway.hasCompletedBrowserChallenge = true;

        if (typeof arr[1] === "string") {
            // If they have sent a user agent, the server will keep track of it
            socket.gateway.userAgent = arr[1];
        }
    }
}

export function checkObfChallenge(socket: Socket, code?: string) {
    throw new Error("Method not implemented");
}
