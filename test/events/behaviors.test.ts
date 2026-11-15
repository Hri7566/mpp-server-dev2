import { beforeAll, describe, expect, test } from "bun:test";
import { bus } from "~/events/bus";
import { loadBehaviors } from "~/events/behaviors";
import type { Socket } from "~/ws/Socket";
import { makeSocket, recordSent, uniqueName } from "../helpers";

beforeAll(() => {
    loadBehaviors();
});

/** Three subscribed sockets: sender + receiver in one channel, outsider elsewhere */
async function setup() {
    const room = uniqueName();
    const sender = makeSocket();
    const receiver = makeSocket();
    const outsider = makeSocket();

    await sender.setChannel(room);
    await receiver.setChannel(room);
    await outsider.setChannel(uniqueName());

    for (const s of [sender, receiver, outsider]) s.subscribeToCustom();

    return {
        sender,
        receiver,
        outsider,
        sentReceiver: recordSent(receiver),
        sentOutsider: recordSent(outsider)
    };
}

function custom(sender: Socket, target: Record<string, unknown>) {
    bus.emit("custom", { m: "custom", data: { hello: 1 }, target }, sender);
}

const customs = (sent: { m: string }[]) => sent.filter(m => m.m === "custom");

describe("custom message relay", () => {
    test("subscribed mode reaches the sender's channel only", async () => {
        const { sender, sentReceiver, sentOutsider } = await setup();

        custom(sender, { mode: "subscribed" });

        expect(customs(sentReceiver)).toHaveLength(1);
        expect(customs(sentOutsider)).toHaveLength(0);
        expect(customs(sentReceiver)[0]).toMatchObject({
            data: { hello: 1 },
            p: sender.getUserID()
        });
    });

    test("global mode reaches other channels too", async () => {
        const { sender, sentReceiver, sentOutsider } = await setup();

        custom(sender, { mode: "subscribed", global: true });

        expect(customs(sentReceiver)).toHaveLength(1);
        expect(customs(sentOutsider)).toHaveLength(1);
    });

    test("id mode only reaches the target", async () => {
        const { sender, receiver, sentReceiver, sentOutsider } = await setup();
        const other = makeSocket();
        await other.setChannel(sender.getCurrentChannel()!.getID());
        other.subscribeToCustom();
        const sentOther = recordSent(other);

        custom(sender, { mode: "id", id: receiver.getUserID() });

        expect(customs(sentReceiver)).toHaveLength(1);
        expect(customs(sentOther)).toHaveLength(0);
        expect(customs(sentOutsider)).toHaveLength(0);
    });

    test("unsubscribed sockets get nothing", async () => {
        const { sender, receiver, sentReceiver } = await setup();
        receiver.unsubscribeFromCustom();

        custom(sender, { mode: "subscribed" });

        expect(customs(sentReceiver)).toHaveLength(0);
    });

    test("malformed targets are dropped", async () => {
        const { sender, sentReceiver } = await setup();

        custom(sender, { mode: 5 });
        custom(sender, { mode: "nonsense" });
        custom(sender, { mode: "ids", ids: "not an array" });
        bus.emit("custom", { m: "custom", data: 1, target: null }, sender);
        bus.emit("custom", { m: "custom", target: { mode: "subscribed" } }, sender);

        expect(customs(sentReceiver)).toHaveLength(0);
    });
});

describe("bans", () => {
    test("a user ban disconnects that user's sockets", () => {
        const victim = makeSocket("ban-victim");
        const bystander = makeSocket("ban-bystander");

        bus.emit("ban", {
            banType: "user",
            _id: "ban-victim",
            duration: 60_000,
            reason: "test"
        });

        expect(victim.isDestroyed()).toBeTrue();
        expect(bystander.isDestroyed()).toBeFalse();
    });
});
