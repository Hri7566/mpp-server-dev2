import { describe, expect, test } from "bun:test";
import { giveRole, removeRole, ROLE_BLACK_MIDI } from "~/data/role";
import { Socket } from "~/ws/Socket";
import { handleMessage } from "~/ws/message";
import { NoteQuota } from "~/ws/ratelimit/NoteQuota";
import { recordSent, tick, uniqueName } from "../helpers";

/** A socket with a database-backed user (so roles load like in production) */
async function connect() {
    const socket = new Socket();
    socket.gateway.hasProcessedHi = true;
    await socket.assignParticipant();
    return socket;
}

/** A socket in a normal (non-lobby) room that someone else owns */
async function inNormalRoom() {
    const owner = await connect();
    await owner.setChannel(uniqueName("quota"));

    const socket = await connect();
    await socket.setChannel(owner.getCurrentChannel()!.getID());
    return socket;
}

const NOTES = Array.from({ length: 50 }, () => ({ n: "a1", v: 0.5, d: 0 }));

/** Send one 50-note chunk, returns whether the server accepted it */
function play(socket: Socket) {
    const before = socket.noteQuota.points;
    handleMessage(socket, JSON.stringify([{ m: "n", t: 1, n: NOTES }]));
    return socket.noteQuota.points < before;
}

describe("note quota refill", () => {
    test("a spent quota refills over time", async () => {
        const socket = await inNormalRoom();

        while (play(socket)) {}
        expect(socket.noteQuota.points).toBeLessThan(50);
        expect(play(socket)).toBeFalse();

        await tick(Socket.NOTE_QUOTA_TICK_MS + 300);

        expect(socket.noteQuota.points).toBeGreaterThan(0);
        expect(play(socket)).toBeTrue();
    });
});

describe("blackMidi role", () => {
    test("gives a 20k note quota", async () => {
        const socket = await connect();
        await giveRole(socket.getUserID()!, ROLE_BLACK_MIDI);

        await socket.setChannel(uniqueName("bm"));

        expect(socket.noteQuota.max).toBe(20000);
        expect(NoteQuota.PARAMS_BLACK_MIDI.max).toBe(20000);
    });

    test("tells the client about the bigger quota", async () => {
        const socket = await connect();
        const sent = recordSent(socket);
        await giveRole(socket.getUserID()!, ROLE_BLACK_MIDI);

        const nq = sent.filter(m => m.m === "nq").at(-1);
        expect(nq?.max).toBe(20000);
    });

    test("overrides the normal, lobby and crown quotas", async () => {
        // Normal room, not the owner
        const normal = await inNormalRoom();
        await giveRole(normal.getUserID()!, ROLE_BLACK_MIDI);
        expect(normal.noteQuota.max).toBe(20000);

        // Lobby
        const lobby = await connect();
        await giveRole(lobby.getUserID()!, ROLE_BLACK_MIDI);
        await lobby.setChannel("lobby");
        expect(lobby.noteQuota.max).toBe(20000);

        // Crown holder
        const owner = await connect();
        await giveRole(owner.getUserID()!, ROLE_BLACK_MIDI);
        await owner.setChannel(uniqueName("bm-owner"));
        expect(owner.isOwner()).toBeTrue();
        expect(owner.noteQuota.max).toBe(20000);
    });

    test("admins keep their larger quota", async () => {
        const socket = await connect();
        socket.participant!.user.flags = { admin: 1 };
        await giveRole(socket.getUserID()!, ROLE_BLACK_MIDI);

        expect(socket.noteQuota.max).toBe(NoteQuota.PARAMS_OFFLINE.max);
    });

    test("applies and comes off without reconnecting", async () => {
        const socket = await inNormalRoom();
        const _id = socket.getUserID()!;
        expect(socket.noteQuota.max).toBe(NoteQuota.PARAMS_NORMAL.max);

        await giveRole(_id, ROLE_BLACK_MIDI);
        expect(socket.noteQuota.max).toBe(20000);

        await removeRole(_id, ROLE_BLACK_MIDI);
        expect(socket.noteQuota.max).toBe(NoteQuota.PARAMS_NORMAL.max);
    });

    test("is picked up on the next connection", async () => {
        const first = await connect();
        const _id = first.getUserID()!;
        await giveRole(_id, ROLE_BLACK_MIDI);
        first.destroy();

        const again = new Socket();
        again.gateway.hasProcessedHi = true;
        again.userID = _id;
        await again.setChannel(uniqueName("bm-again"));

        expect(again.noteQuota.max).toBe(20000);
    });

    test("lets the bearer actually play far more notes", async () => {
        const normal = await inNormalRoom();
        const blackMidi = await inNormalRoom();
        await giveRole(blackMidi.getUserID()!, ROLE_BLACK_MIDI);

        let normalChunks = 0;
        while (play(normal)) normalChunks++;

        let bmChunks = 0;
        while (play(blackMidi)) bmChunks++;

        expect(normalChunks * 50).toBeLessThanOrEqual(NoteQuota.PARAMS_NORMAL.max);
        expect(bmChunks * 50).toBeGreaterThan(19000);
    });

    test("other users are unaffected", async () => {
        const holder = await inNormalRoom();
        const other = await inNormalRoom();
        await giveRole(holder.getUserID()!, ROLE_BLACK_MIDI);

        expect(holder.noteQuota.max).toBe(20000);
        expect(other.noteQuota.max).toBe(NoteQuota.PARAMS_NORMAL.max);
    });
});
