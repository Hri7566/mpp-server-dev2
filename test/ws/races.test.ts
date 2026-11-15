/**
 * Race conditions reported against another MPP server.
 * These use database-loaded users so the async gaps are real.
 */

import { expect, test } from "bun:test";
import { ChannelList } from "~/channel/ChannelList";
import { readUser } from "~/data/user";
import { bus } from "~/events/bus";
import { Participant } from "~/participant";
import { flushUser } from "~/participant/userSaves";
import { Socket } from "~/ws/Socket";
import { handleMessage } from "~/ws/message";
import { recordSent, tick, uniqueName } from "../helpers";

/** A socket that has passed hi but whose user still has to load from the DB */
function freshSocket() {
    const socket = new Socket();
    socket.gateway.hasProcessedHi = true;
    return socket;
}

test("socket closing during hi doesn't leave a participant behind", async () => {
    const participantsBefore = Participant.cache.size;
    const listenersBefore = bus.listenerCount("user data update");

    const socket = new Socket();
    const code = btoa(JSON.stringify([true, "test"]));
    handleMessage(socket, JSON.stringify([{ m: "hi", code }]));
    socket.destroy(); // while hi is still looking up tokens

    await tick(500);

    const leaked = [...Participant.cache.values()].filter(p =>
        p.sockets.has(socket)
    );

    expect(leaked).toHaveLength(0);
    expect(socket.participant).toBeUndefined();
    expect(Participant.cache.size).toBe(participantsBefore);
    expect(bus.listenerCount("user data update")).toBe(listenersBefore);
});

test("socket closing while its user loads doesn't leave a ghost in the room", async () => {
    const name = uniqueName();
    const socket = freshSocket();

    const joining = socket.setChannel(name);
    socket.destroy();
    await joining;
    await tick(20);

    const ch = ChannelList.getChannel(name);
    expect(ch?.getParticipantList() ?? []).toHaveLength(0);
    expect(ch?.crown?.participantId).toBeUndefined();
});

test("two users entering the same new room at once share one channel", async () => {
    const name = uniqueName();
    const a = freshSocket();
    const b = freshSocket();

    await Promise.all([a.setChannel(name), b.setChannel(name)]);

    const matching = ChannelList.getList().filter(ch => ch.getID() === name);
    expect(matching).toHaveLength(1);
    expect(a.getCurrentChannel()).toBe(matching[0]);
    expect(b.getCurrentChannel()).toBe(matching[0]);
    expect(matching[0].getParticipantList()).toHaveLength(2);

    // And they actually hear each other
    const sentB = recordSent(b);
    matching[0].playNotes({ m: "n", t: 1, n: [{ n: "a1", d: 0, v: 0.5 }] }, a);
    expect(sentB.filter(m => m.m === "n")).toHaveLength(1);
});

test("same IP opening two sockets at once: renames reach both and the DB", async () => {
    const a = freshSocket();
    const b = freshSocket();
    b.ip = a.ip;

    const [partA, partB] = await Promise.all([
        a.assignParticipant(),
        b.assignParticipant()
    ]);
    expect(partA.user._id).toBe(partB.user._id);

    await partA.userset("Renamed");
    expect(partB.user.name).toBe("Renamed");

    a.destroy();
    b.destroy();
    await flushUser(partA.user._id);

    expect((await readUser(partA.user._id))?.name).toBe("Renamed");
});

test("extra fields like kicked: true don't bypass the ch rate limit", async () => {
    const socket = freshSocket();
    await socket.assignParticipant();

    const moves = Array.from({ length: 20 }, () => ({
        m: "ch",
        _id: uniqueName(),
        kicked: true
    }));

    handleMessage(socket, JSON.stringify(moves));
    await tick(100);

    const visited = moves.filter(msg =>
        ChannelList.getChannel(msg._id)?.hasUser(socket.getUserID()!)
    );
    const created = moves.filter(msg => ChannelList.getChannel(msg._id));

    expect(created.length).toBeLessThanOrEqual(1);
    expect(visited.length).toBeLessThanOrEqual(1);
});
