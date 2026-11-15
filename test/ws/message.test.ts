import { describe, expect, test } from "bun:test";
import { Socket } from "~/ws/Socket";
import { handleMessage } from "~/ws/message";
import { catchUnhandled, makeSocket } from "../helpers";

/**
 * Raw frames a client could send. None of these may crash the server
 * (an unhandled rejection or uncaught exception exits the process).
 */
const hostileFrames = [
    // Crashed the server via Logger's args.join()
    '{"toString":1}',
    '{"toString":{},"valueOf":1}',
    '{"a":{"toString":2}}',
    // Not JSON / not arrays
    "not json",
    "",
    "null",
    "42",
    '"string"',
    // Arrays with junk entries
    "[null]",
    "[1, 2, 3]",
    '[{"m":null}]',
    '[{"m":{"toString":1}}]',
    '[{"no m":true}]',
    // Real message types with bad payloads
    '[{"m":"hi","code":{"toString":1}}]',
    '[{"m":"hi","code":"not base64!"}]',
    '[{"m":"ch","_id":{"toString":1}}]',
    '[{"m":"ch","_id":"x","set":"not an object"}]',
    '[{"m":"a","message":null}]',
    '[{"m":"a","message":{"toString":1}}]',
    '[{"m":"n","n":"notes","t":1}]',
    '[{"m":"n","n":[null],"t":1}]',
    '[{"m":"m","x":{"toString":1},"y":1}]',
    '[{"m":"userset","set":null}]',
    '[{"m":"userset","set":{"name":{"toString":1}}}]',
    '[{"m":"chset","set":{"toString":1}}]',
    '[{"m":"chown","id":{"toString":1}}]',
    '[{"m":"kickban","_id":"x","ms":1e400}]',
    '[{"m":"custom","data":1,"target":null}]',
    '[{"m":"admin message","password":{"toString":1}}]',
    '[{"m":"admin message","password":"wrong","msg":{"m":"name"}}]',
    '[{"m":"t","e":"not a number"}]',
    '[{"m":"__proto__"}]',
    '[{"m":"constructor"}]'
];

describe("hostile messages", () => {
    for (const frame of hostileFrames) {
        test(`survives ${frame.slice(0, 60) || "(empty)"}`, async () => {
            const errors = await catchUnhandled(() => {
                // Once before hi, once after
                handleMessage(new Socket(), frame);
                handleMessage(makeSocket(), frame);
            });

            expect(errors).toHaveLength(0);
        });
    }
});

describe("message routing", () => {
    test("each message in an array is handled in order", () => {
        const socket = new Socket();
        const seen: string[] = [];

        socket.on("probe-a", () => seen.push("a"));
        socket.on("probe-b", () => seen.push("b"));

        handleMessage(socket, JSON.stringify([{ m: "probe-a" }, { m: "probe-b" }]));

        expect(seen).toEqual(["a", "b"]);
    });

    test("messages stop being handled once the socket is destroyed", () => {
        const socket = new Socket();
        const seen: string[] = [];

        socket.on("probe", () => seen.push("probe"));
        socket.on("kill", () => socket.destroy());

        handleMessage(
            socket,
            JSON.stringify([{ m: "probe" }, { m: "kill" }, { m: "probe" }])
        );

        expect(seen).toEqual(["probe"]);
    });
});
