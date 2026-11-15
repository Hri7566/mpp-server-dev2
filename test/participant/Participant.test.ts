import { describe, expect, test } from "bun:test";
import { ChannelList } from "~/channel/ChannelList";
import { readUser } from "~/data/user";
import { bus } from "~/events/bus";
import { Participant } from "~/participant";
import { config } from "~/participant/config";
import { Socket } from "~/ws/Socket";
import { getPendingUserChange } from "~/participant/userSaves";
import {
    catchUnhandled,
    makeSocket,
    recordSent,
    tick,
    uniqueName
} from "../helpers";

/** Put a participant with the given flags in a fresh channel */
async function inChannel(flags = {}) {
    const name = uniqueName();
    const socket = makeSocket(undefined, flags);
    await socket.setChannel(name);
    const ch = ChannelList.getChannel(name)!;
    return { socket, part: socket.participant!, ch };
}

describe("loading", () => {
    test("a new user is created in the database on first load", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();

        expect(part.loaded).toBeTrue();
        expect(part.user._id).not.toBe("");
        expect(part.user.name).toBe(config.defaultName);
        expect(await readUser(part.user._id)).not.toBeNull();
    });

    test("loadUser only hits the database once", async () => {
        const socket = new Socket();
        new Participant(socket);
        const part = socket.participant!;

        const first = part.loadUser();
        const second = part.loadUser();

        expect(second).toBe(first);
        await first;
    });

    test("userset before loading does nothing (and doesn't throw)", async () => {
        const socket = new Socket();
        const part = new Participant(socket);

        const errors = await catchUnhandled(() => part.userset("early"));

        expect(errors).toHaveLength(0);
        expect(part.user.name).toBe(config.defaultName);
    });
});

describe("userset", () => {
    test("name changes reach every participant of the user right away", async () => {
        const name = uniqueName();
        const tab1 = new Socket();
        const part = await tab1.assignParticipant();
        tab1.gateway.hasProcessedHi = true;
        await tab1.setChannel(name);
        const sent = recordSent(tab1);

        // A separate participant for the same user in another channel
        const other = new Participant(undefined, { ...part.user });

        await part.userset("New Name");

        expect(part.user.name).toBe("New Name");
        expect(other.user.name).toBe("New Name");

        // The channel is told about the new name
        expect(
            sent.some(m => m.m === "p" && m.name === "New Name")
        ).toBeTrue();
    });

    test("name changes are not written to the database immediately", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();

        for (let i = 0; i < 50; i++) await part.userset(`spam ${i}`);

        expect(part.user.name).toBe("spam 49");
        expect((await readUser(part.user._id))?.name).toBe(config.defaultName);
        expect(getPendingUserChange(part.user._id)).toEqual({
            name: "spam 49"
        });
    });

    test("the latest name is saved when the socket closes", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();
        const _id = part.user._id;

        await part.userset("first");
        await part.userset("final");
        socket.destroy();
        await tick(50);

        expect((await readUser(_id))?.name).toBe("final");
        expect(getPendingUserChange(_id)).toBeUndefined();
    });

    test("a new tab loads the unsaved name, not the database one", async () => {
        const tab1 = new Socket();
        const part = await tab1.assignParticipant();

        await part.userset("Unsaved");

        // Same user, freshly loaded from the database
        const tab2 = new Socket();
        tab2.userID = part.user._id;
        const part2 = await tab2.assignParticipant();

        expect(part2.user.name).toBe("Unsaved");
    });

    test("other database updates don't revert an unsaved name", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();
        const stale = await readUser(part.user._id);

        await part.userset("Fresh");

        // e.g. an admin changed a flag and the stale row was broadcast
        bus.emit("user data update", { ...stale!, flags: '{"volume":5}' });

        expect(part.user.name).toBe("Fresh");
        expect(part.user.flags?.volume).toBe(5);
    });

    test("setting the same name again doesn't queue a save", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();

        await part.userset(part.user.name);

        expect(getPendingUserChange(part.user._id)).toBeUndefined();
    });

    test("names over 40 characters are rejected", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();

        await part.userset("x".repeat(41));
        await tick(20);

        expect(part.user.name).toBe(config.defaultName);
    });

    test("invalid colors are ignored", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();
        const color = part.user.color;

        await part.userset(undefined, "not a color", true);
        await tick(20);

        expect(part.user.color).toBe(color);
    });

    test("valid colors are applied when color changing is allowed", async () => {
        const socket = new Socket();
        const part = await socket.assignParticipant();

        await part.userset(undefined, "#123abc", true);
        await tick(20);

        expect(part.user.color).toBe("#123abc");
    });
});

describe("user data updates", () => {
    test("only participants of that user are updated", () => {
        const a = new Participant(undefined, {
            _id: "update-a",
            name: "a",
            color: "#000000"
        });
        const b = new Participant(undefined, {
            _id: "update-b",
            name: "b",
            color: "#000000"
        });

        bus.emit("user data update", {
            id: "update-a",
            name: "changed",
            color: "#ffffff",
            flags: "{}",
            tag: null
        });

        expect(a.user.name).toBe("changed");
        expect(b.user.name).toBe("b");
    });

    test("destroyed participants stop listening", () => {
        const p = new Participant(undefined, {
            _id: "update-gone",
            name: "before",
            color: "#000000"
        });
        p.destroy();

        bus.emit("user data update", {
            id: "update-gone",
            name: "after",
            color: "#ffffff",
            flags: "{}",
            tag: null
        });

        expect(p.user.name).toBe("before");
        expect(Participant.get(p.id)).toBeUndefined();
    });

    test("bad JSON in stored flags/tag doesn't throw", () => {
        const user = Participant.convertUser({
            id: "x",
            name: "x",
            color: "#000000",
            flags: "{not json",
            tag: "{also not json",
            group: ""
        });

        expect(user.flags).toBeUndefined();
        expect(user.tag).toBeUndefined();
    });
});

describe("public info", () => {
    test("override_id replaces the public _id", () => {
        const p = new Participant(undefined, {
            _id: "real",
            name: "x",
            color: "#000000",
            flags: { override_id: "fake" }
        });

        expect(p.simple()._id).toBe("fake");
    });

    test("vanished participants are hidden from the participant list", async () => {
        const { ch, part } = await inChannel({ vanish: 1 });

        expect(part.vanished).toBeTrue();
        expect(ch.getParticipantList().map(p => p.id)).not.toContain(part.id);
        expect(ch.getParticipantList(true).map(p => p.id)).toContain(part.id);
    });

    test("cursor positions are stored with two decimals", async () => {
        const { part } = await inChannel();

        part.setCursorPos(12.3456, 7);

        expect(part.cursorPos).toEqual({ x: "12.35", y: "7.00" });
    });
});

describe("chat flags", () => {
    async function say(flags: Record<string, unknown>, message: string) {
        const { part, ch } = await inChannel(flags);
        part.chat({ m: "a", message });
        await tick(20);
        return ch.chatHistory.at(-1)?.a;
    }

    test("normal chat goes through", async () => {
        expect(await say({}, "hello")).toBe("hello");
    });

    test("cant_chat blocks chat", async () => {
        expect(await say({ cant_chat: 1 }, "hello")).toBeUndefined();
    });

    test("chat_curse_1 turns vowels into o", async () => {
        expect(await say({ chat_curse_1: 1 }, "Hi Alice")).toBe("Ho Oloco");
    });

    test("banned words are dropped, even with spaces in them", async () => {
        expect(await say({}, "check ly hq")).toBeUndefined();
    });

    test("chat_color changes the color shown in chat", async () => {
        const { part, ch } = await inChannel({ chat_color: "#ff00ff" });
        part.chat({ m: "a", message: "colorful" });
        await tick(20);

        expect(ch.chatHistory.at(-1)?.p.color).toBe("#ff00ff");
    });
});
