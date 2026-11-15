import { describe, expect, test } from "bun:test";
import { Channel } from "~/channel";
import { ChannelList } from "~/channel/ChannelList";
import { config } from "~/channel/config";
import { makeSocket, recordSent, uniqueName } from "../helpers";

/** Make a channel and put a participant for each user ID in it */
async function channelWith(name: string, ...userIDs: string[]) {
    const sockets = [];

    for (const _id of userIDs) {
        const socket = makeSocket(_id);
        await socket.setChannel(name);
        sockets.push(socket);
    }

    const ch = ChannelList.getChannel(name);
    if (!ch) throw new Error("channel wasn't created");

    return { ch, sockets };
}

describe("lobbies", () => {
    test("isTrueLobby matches lobby, lobby2 ... lobby99 only", () => {
        const yes = ["lobby", "lobby2", "lobby15", "lobby99"];
        const no = ["lobbyx", "lobby100", "xlobby", "test/awkward", "Lobby"];

        for (const name of yes) {
            expect(new Channel(name).isTrueLobby()).toBeTrue();
        }

        for (const name of no) {
            expect(new Channel(name).isTrueLobby()).toBeFalse();
        }
    });

    test("getNextLobbyID counts upward", () => {
        expect(new Channel("lobby").getNextLobbyID()).toBe("lobby2");
        expect(new Channel("lobby7").getNextLobbyID()).toBe("lobby8");
    });

    test("each lobby gets its own copy of the lobby settings", () => {
        const original = JSON.stringify(config.lobbySettings);
        const a = new Channel("lobby41");
        const b = new Channel("lobby42");

        a.setFlag("limit", 5);
        a.changeSettings({ color: "#123456" }, true);

        expect(a.getSetting("color")).toBe("#123456");
        expect(b.getSetting("color")).not.toBe("#123456");
        expect(JSON.stringify(config.lobbySettings)).toBe(original);
    });

    test("non-admins can't change lobby settings", () => {
        const ch = new Channel("lobby43");
        const color = ch.getSetting("color");

        ch.changeSettings({ color: "#abcdef" });
        expect(ch.getSetting("color")).toBe(color);
    });
});

describe("settings", () => {
    test("valid settings are applied and color2 is derived", () => {
        const ch = new Channel(uniqueName());

        ch.changeSettings({ color: "#ff0000", crownsolo: true });

        expect(ch.getSetting("color")).toBe("#ff0000");
        expect(ch.getSetting("crownsolo")).toBeTrue();
        expect(ch.getSetting("color2")).toMatch(/^#[0-9a-f]{6}$/i);
    });

    test("invalid settings are ignored", () => {
        const ch = new Channel(uniqueName());
        const color = ch.getSetting("color");

        ch.changeSettings({
            color: "red",
            chat: "yes" as unknown as boolean,
            limit: 500
        });

        expect(ch.getSetting("color")).toBe(color);
        expect(ch.getSetting("chat")).toBeTrue();
        expect(ch.getSetting("limit")).toBeUndefined();
    });

    test("only admins can set owner_id and lobby", () => {
        const ch = new Channel(uniqueName());

        ch.changeSettings({ owner_id: "someone", lobby: true });
        expect(ch.getSetting("owner_id")).toBeUndefined();
        expect(ch.getSetting("lobby")).toBeFalsy();

        ch.changeSettings({ owner_id: "someone" }, true);
        expect(ch.getSetting("owner_id")).toBe("someone");
    });

    test("settings passed on creation are validated", () => {
        const ch = new Channel(uniqueName(), {
            color: "#00ff00",
            owner_id: "sneaky",
            visible: false
        });

        expect(ch.getSetting("color")).toBe("#00ff00");
        expect(ch.getSetting("visible")).toBeFalse();
        expect(ch.getSetting("owner_id")).toBeUndefined();
    });
});

describe("bans", () => {
    test("a live ban is found even right after an expired one", () => {
        const ch = new Channel(uniqueName());
        const now = Date.now();

        ch.bans = [
            { userId: "old", startTime: 0, endTime: now - 1 },
            { userId: "u1", startTime: now, endTime: now + 60_000 }
        ];

        expect(ch.isBanned("u1")).toBeTrue();
        expect(ch.isBanned("old")).toBeFalse();
        expect(ch.bans.map(b => b.userId)).toEqual(["u1"]);
    });

    test("unban removes the ban", () => {
        const ch = new Channel(uniqueName());
        const now = Date.now();

        ch.bans = [
            { userId: "a", startTime: now, endTime: now + 60_000 },
            { userId: "b", startTime: now, endTime: now + 60_000 }
        ];

        ch.unban("a");
        expect(ch.isBanned("a")).toBeFalse();
        expect(ch.isBanned("b")).toBeTrue();
    });

    test("kickban bans the user and moves them out", async () => {
        const name = uniqueName();
        const { ch, sockets } = await channelWith(name, "owner", "victim");
        const [, victim] = sockets;

        await ch.kickban("victim", 60_000, "owner");

        expect(ch.isBanned("victim")).toBeTrue();
        expect(ch.hasUser("victim")).toBeFalse();
        expect(victim.getCurrentChannel()?.getID()).toBe(config.fullChannel);
    });

    test("kickban rejects bad durations and absent users", async () => {
        const { ch } = await channelWith(uniqueName(), "owner", "someone");

        await ch.kickban("someone", -1);
        await ch.kickban("someone", (config.maxBanMinutes + 1) * 60_000);
        await ch.kickban("not-here", 60_000);

        expect(ch.bans).toHaveLength(0);
        expect(ch.hasUser("someone")).toBeTrue();
    });

    test("banned users can't rejoin", async () => {
        const name = uniqueName();
        const { ch } = await channelWith(name, "owner", "victim");
        await ch.kickban("victim", 60_000);

        const again = makeSocket("victim");
        await again.setChannel(name);

        expect(again.getCurrentChannel()?.getID()).toBe(config.fullChannel);
    });
});

describe("participant limit", () => {
    test("getLimit prefers the admin flag and treats 0 as no limit", () => {
        const ch = new Channel(uniqueName());
        expect(ch.getLimit()).toBeUndefined();

        ch.changeSettings({ limit: 3 });
        expect(ch.getLimit()).toBe(3);

        ch.setFlag("limit", 10);
        expect(ch.getLimit()).toBe(10);

        ch.setFlags({});
        ch.changeSettings({ limit: 0 });
        expect(ch.getLimit()).toBeUndefined();
    });

    test("isFull follows the limit", async () => {
        const { ch } = await channelWith(uniqueName(), "a", "b");

        expect(ch.isFull()).toBeFalse();
        ch.changeSettings({ limit: 2 });
        expect(ch.isFull()).toBeTrue();
    });
});

describe("crown", () => {
    test("whoever creates a channel gets the crown", async () => {
        const { ch, sockets } = await channelWith(uniqueName(), "creator");

        expect(ch.crown?.userId).toBe("creator");
        expect(sockets[0].isOwner()).toBeTrue();
    });

    test("the crown drops when its holder leaves", async () => {
        const { ch, sockets } = await channelWith(uniqueName(), "owner", "x");

        sockets[0].destroy();

        expect(ch.crown?.participantId).toBeUndefined();
        expect(ch.crown?.userId).toBe("owner");
    });

    test("the designated owner gets the crown on join", async () => {
        const name = uniqueName();
        const { ch } = await channelWith(name, "first");
        ch.changeSettings({ owner_id: "boss" }, true);

        const boss = makeSocket("boss");
        await boss.setChannel(name);

        expect(ch.crown?.userId).toBe("boss");
    });
});

describe("chat", () => {
    test("messages are sanitized and stored", async () => {
        const { ch } = await channelWith(uniqueName(), "talker");
        const p = ch.getParticipantByUserID("talker")!.simple();

        await ch.chat({ m: "a", message: "  hi\u0000 there  " }, p);

        expect(ch.chatHistory.at(-1)?.a).toBe("hi there");
    });

    test("empty and overlong messages are dropped", async () => {
        const { ch } = await channelWith(uniqueName(), "talker");
        const p = ch.getParticipantByUserID("talker")!.simple();

        await ch.chat({ m: "a", message: "   " }, p);
        await ch.chat({ m: "a", message: "x".repeat(513) }, p);

        expect(ch.chatHistory).toHaveLength(0);
    });

    test("chat is blocked when the chat setting is off", async () => {
        const { ch } = await channelWith(uniqueName(), "talker");
        const p = ch.getParticipantByUserID("talker")!.simple();

        ch.changeSettings({ chat: false });
        await ch.chat({ m: "a", message: "hello" }, p);

        expect(ch.chatHistory).toHaveLength(0);
    });

    test("history is capped at 512 messages", async () => {
        const { ch } = await channelWith(uniqueName(), "talker");
        const p = ch.getParticipantByUserID("talker")!.simple();

        for (let i = 0; i < 520; i++) {
            await ch.sendChatEvent({ m: "a", message: `msg ${i}` }, p);
        }

        expect(ch.chatHistory).toHaveLength(512);
        expect(ch.chatHistory.at(-1)?.a).toBe("msg 519");
    });
});

describe("notes", () => {
    test("notes reach everyone except the sending socket", async () => {
        const { ch, sockets } = await channelWith(uniqueName(), "a", "b");
        const [a, b] = sockets;
        const sentA = recordSent(a);
        const sentB = recordSent(b);

        ch.playNotes({ m: "n", t: 1, n: [{ n: "a1", d: 0, v: 0.5 }] }, a);

        expect(sentA.filter(m => m.m === "n")).toHaveLength(0);
        expect(sentB.filter(m => m.m === "n")).toHaveLength(1);
    });

    test("crownsolo only lets the crown holder play", async () => {
        const { ch, sockets } = await channelWith(uniqueName(), "own", "oth");
        const [owner, other] = sockets;
        const sentOwner = recordSent(owner);
        const sentOther = recordSent(other);

        ch.changeSettings({ crownsolo: true });
        ch.playNotes({ m: "n", t: 1, n: [{ n: "a1", d: 0, v: 0.5 }] }, other);
        expect(sentOwner.filter(m => m.m === "n")).toHaveLength(0);

        ch.playNotes({ m: "n", t: 1, n: [{ n: "a1", d: 0, v: 0.5 }] }, owner);
        expect(sentOther.filter(m => m.m === "n")).toHaveLength(1);
    });
});

describe("destroy", () => {
    test("destroying a channel moves everyone out and unlists it", async () => {
        const name = uniqueName();
        const { ch, sockets } = await channelWith(name, "a");

        ch.destroy();
        await Promise.resolve();

        expect(ChannelList.getChannel(name)).toBeUndefined();
        expect(ch.isDestroyed()).toBeTrue();
        // setChannel is async, give it a moment
        await new Promise(r => setTimeout(r, 10));
        expect(sockets[0].getCurrentChannel()?.getID()).toBe(
            config.fullChannel
        );
    });
});
