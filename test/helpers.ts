/**
 * Shared helpers for tests (not a test file itself)
 */

import { Participant } from "~/participant";
import type { UserFlags } from "~/util/types";
import { Socket } from "~/ws/Socket";

/**
 * Get a channel name nothing else is using
 * (avoid "test/..." names, those match the lobby regexes)
 */
export function uniqueName(prefix = "unit") {
    return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Make a fake socket that has already said hi, with a preloaded user
 * (preloaded users skip the database entirely)
 */
export function makeSocket(
    _id: string = crypto.randomUUID(),
    flags: UserFlags = {}
) {
    const socket = new Socket();
    socket.gateway.hasProcessedHi = true;
    new Participant(socket, { _id, name: _id, color: "#ffffff", flags });
    return socket;
}

/**
 * Record everything the server sends to a socket
 */
export function recordSent(socket: Socket) {
    const sent: { m: string; [key: string]: unknown }[] = [];

    socket.sendArray = ((arr: { m: string }[]) => {
        sent.push(...arr);
    }) as Socket["sendArray"];

    return sent;
}

/**
 * Wait for pending promises/timers to settle
 */
export function tick(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Collect unhandled rejections while running a function
 * (an unhandled rejection exits the real server)
 */
export async function catchUnhandled(fn: () => unknown, settleMs = 50) {
    const errors: unknown[] = [];
    const onRejection = (reason: unknown) => errors.push(reason);
    const onException = (err: unknown) => errors.push(err);

    process.on("unhandledRejection", onRejection);
    process.on("uncaughtException", onException);

    try {
        await fn();
        await tick(settleMs);
    } finally {
        process.off("unhandledRejection", onRejection);
        process.off("uncaughtException", onException);
    }

    return errors;
}
