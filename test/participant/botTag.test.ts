import { describe, expect, test } from "bun:test";
import { ChannelList } from "~/channel/ChannelList";
import { giveRole } from "~/data/role";
import { readUser } from "~/data/user";
import { Participant } from "~/participant";
import { BOT_USER_AGENT } from "~/util/browserChallenge";
import { createUserIDFromIP } from "~/util/id";
import { Socket } from "~/ws/Socket";
import { handleMessage } from "~/ws/message";
import { makeSocket, recordSent, tick, uniqueName } from "../helpers";

const BOT_TAG = { text: "BOT", color: "#5555ff" };

/** A socket that answered the challenge with "bot" */
function botSocket(_id?: string, tag?: { text: string; color: string }) {
    const socket = new Socket();
    socket.gateway.hasProcessedHi = true;
    socket.gateway.userAgent = BOT_USER_AGENT;
    new Participant(socket, {
        _id: _id ?? crypto.randomUUID(),
        name: "bot",
        color: "#ffffff",
        tag
    });
    return socket;
}

describe("temporary BOT tag", () => {
    test("connections without a user agent show a BOT tag", () => {
        const socket = botSocket();
        expect(socket.participant!.simple().tag).toEqual(BOT_TAG);
    });

    test("normal browsers don't get it", () => {
        const socket = makeSocket();
        socket.gateway.userAgent = "Mozilla/5.0";
        expect(socket.participant!.simple().tag).toBeUndefined();
    });

    test("a real tag takes priority", () => {
        const socket = botSocket(undefined, { text: "ADMIN", color: "#ff5555" });
        expect(socket.participant!.simple().tag).toEqual({
            text: "ADMIN",
            color: "#ff5555"
        });
    });

    test("other people in the room see it when the bot joins", async () => {
        const room = uniqueName("bottag");
        const human = makeSocket();
        await human.setChannel(room);
        const seen = recordSent(human);

        const bot = botSocket();
        await bot.setChannel(room);

        const ch = ChannelList.getChannel(room)!;
        const listed = ch.getParticipantList().find(p => p.id === bot.participant!.id);
        expect(listed?.tag).toEqual(BOT_TAG);
        expect(seen.some(m => m.m === "p" && JSON.stringify(m.tag) === JSON.stringify(BOT_TAG))).toBeTrue();
    });

    test("it goes away when the bot connection leaves, other tabs stay", async () => {
        const room = uniqueName("bottag");
        const _id = crypto.randomUUID();

        const browserTab = makeSocket(_id);
        await browserTab.setChannel(room);
        const seen = recordSent(browserTab);

        const bot = botSocket(_id);
        await bot.setChannel(room);
        expect(browserTab.participant!.simple().tag).toEqual(BOT_TAG);

        bot.destroy();
        expect(browserTab.participant!.simple().tag).toBeUndefined();

        // The room was told both times
        const tagUpdates = seen.filter(m => m.m === "p").map(m => JSON.stringify(m.tag ?? null));
        expect(tagUpdates).toContain(JSON.stringify(BOT_TAG));
        expect(tagUpdates.at(-1)).toBe("null");
    });

    test("it is never saved to the database", async () => {
        const socket = new Socket();
        socket.gateway.hasProcessedHi = true;
        socket.gateway.userAgent = BOT_USER_AGENT;
        const part = await socket.assignParticipant();

        expect(part.simple().tag).toEqual(BOT_TAG);
        await part.userset("Renamed bot");
        const stored = await readUser(part.user._id);
        expect(stored?.tag ?? null).not.toContain("BOT");
    });

    test("an authorized bot sending hi without a user agent gets the tag", async () => {
        const socket = new Socket();
        const sent = recordSent(socket);
        await giveRole(createUserIDFromIP(socket.ip), "bot");

        handleMessage(socket, JSON.stringify([{ m: "hi", code: "bot" }]));
        await tick(500);

        expect(socket.isDestroyed()).toBeFalse();
        const hi = sent.find(m => m.m === "hi") as { u?: { tag?: unknown } } | undefined;
        expect(hi?.u?.tag).toEqual(BOT_TAG);
    });

    test("an unauthorized one is still disconnected", async () => {
        const socket = new Socket();
        handleMessage(socket, JSON.stringify([{ m: "hi", code: "bot" }]));
        await tick(500);

        expect(socket.isDestroyed()).toBeTrue();
    });
});
