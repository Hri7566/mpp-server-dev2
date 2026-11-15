import { expect, test } from "bun:test";
import { Socket } from "~/ws/Socket";
import { handleMessage } from "~/ws/message";
import { recordSent, tick, uniqueName } from "../helpers";

/** A tab for a user (database-backed, like a real connection) */
async function tab(userID?: string) {
    const socket = new Socket();
    socket.gateway.hasProcessedHi = true;
    if (userID) socket.userID = userID;
    await socket.assignParticipant();
    return socket;
}

const note = (n: string) => JSON.stringify([{ m: "n", t: Date.now(), n: [{ n, v: 0.5 }] }]);
const notesFrom = (sent: { m: string; n?: unknown }[], n: string) =>
    sent.filter(m => m.m === "n" && JSON.stringify(m.n).includes(`"${n}"`)).length;

test("two tabs of one user hear each other after the first tab has played a lot", async () => {
    const room = uniqueName("tabs");

    // First tab joins (gets the crown) and plays a long piece
    const tab1 = await tab();
    await tab1.setChannel(room);
    const chord = Array.from({ length: 50 }, () => ({ n: "c3", v: 0.5 }));
    for (let i = 0; i < 100; i++)
        handleMessage(tab1, JSON.stringify([{ m: "n", t: Date.now(), n: chord }]));

    // Some time later, a second tab of the same user joins
    await tick(Socket.NOTE_QUOTA_TICK_MS + 500);
    const tab2 = await tab(tab1.getUserID());
    await tab2.setChannel(room);
    expect(tab2.participant).toBe(tab1.participant!);

    const sent1 = recordSent(tab1);
    const sent2 = recordSent(tab2);

    handleMessage(tab1, note("a1"));
    handleMessage(tab2, note("b1"));

    expect(notesFrom(sent1, "b1")).toBe(1); // tab1 hears tab2
    expect(notesFrom(sent2, "a1")).toBe(1); // tab2 hears tab1

    // Neither gets its own notes echoed back
    expect(notesFrom(sent1, "a1")).toBe(0);
    expect(notesFrom(sent2, "b1")).toBe(0);
});
