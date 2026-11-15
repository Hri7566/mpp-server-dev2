import { afterEach, describe, expect, test } from "bun:test";
import { createUser, readUser } from "~/data/user";
import {
    applyPendingUserChange,
    discardPendingUserChange,
    flushAllUsers,
    flushUser,
    getPendingUserChange,
    queueUserChange,
    startUserSaveTimer,
    stopUserSaveTimer
} from "~/participant/userSaves";
import { tick } from "../helpers";

/** Make a user that exists in the (test) database */
async function makeUser(name = "Original", color = "#111111") {
    const _id = crypto.randomUUID();
    await createUser(_id, name, color, {});
    return _id;
}

afterEach(() => {
    stopUserSaveTimer();
});

describe("queue", () => {
    test("changes merge, latest value wins", () => {
        const _id = crypto.randomUUID();

        queueUserChange(_id, { name: "a" });
        queueUserChange(_id, { color: "#222222" });
        queueUserChange(_id, { name: "b" });

        expect(getPendingUserChange(_id)).toEqual({
            name: "b",
            color: "#222222"
        });
    });

    test("empty changes aren't queued", () => {
        const _id = crypto.randomUUID();
        queueUserChange(_id, {});
        expect(getPendingUserChange(_id)).toBeUndefined();
    });

    test("pending changes are layered over database data", () => {
        const _id = crypto.randomUUID();
        queueUserChange(_id, { name: "pending" });

        const user = applyPendingUserChange(_id, {
            name: "from db",
            color: "#000000"
        });

        expect(user).toEqual({ name: "pending", color: "#000000" });
    });

    test("discarding one field keeps the other", () => {
        const _id = crypto.randomUUID();
        queueUserChange(_id, { name: "n", color: "#333333" });

        discardPendingUserChange(_id, ["name"]);
        expect(getPendingUserChange(_id)).toEqual({ color: "#333333" });

        discardPendingUserChange(_id, ["color"]);
        expect(getPendingUserChange(_id)).toBeUndefined();
    });
});

describe("saving", () => {
    test("flushUser writes and clears the change", async () => {
        const _id = await makeUser();
        queueUserChange(_id, { name: "Saved", color: "#444444" });

        await flushUser(_id);

        const user = await readUser(_id);
        expect(user?.name).toBe("Saved");
        expect(user?.color).toBe("#444444");
        expect(getPendingUserChange(_id)).toBeUndefined();
    });

    test("flushUser with nothing pending doesn't touch the database", async () => {
        const _id = await makeUser("Untouched");

        await flushUser(_id);

        expect((await readUser(_id))?.name).toBe("Untouched");
    });

    test("flushAllUsers saves everyone", async () => {
        const a = await makeUser();
        const b = await makeUser();
        queueUserChange(a, { name: "A" });
        queueUserChange(b, { name: "B" });

        await flushAllUsers();

        expect((await readUser(a))?.name).toBe("A");
        expect((await readUser(b))?.name).toBe("B");
    });

    test("a failed save is kept for the next try", async () => {
        // No such user in the database, so the update fails
        const _id = crypto.randomUUID();
        queueUserChange(_id, { name: "Retry me" });

        await flushUser(_id);

        expect(getPendingUserChange(_id)).toEqual({ name: "Retry me" });
        discardPendingUserChange(_id);
    });

    test("a save already running is waited for, and saves land in order", async () => {
        const _id = await makeUser();

        queueUserChange(_id, { name: "Older" });
        const first = flushUser(_id); // e.g. a socket closed, not awaited

        queueUserChange(_id, { name: "Newer" });
        await flushAllUsers(); // e.g. shutdown

        expect((await readUser(_id))?.name).toBe("Newer");
        await first;
        expect((await readUser(_id))?.name).toBe("Newer");
    });

    test("every caller waits until the data is really written", async () => {
        const _id = await makeUser();
        queueUserChange(_id, { name: "Written" });

        // Two closes at once; whichever returns, the write must be done
        await Promise.race([flushUser(_id), flushUser(_id)]);

        expect((await readUser(_id))?.name).toBe("Written");
    });

    test("the periodic sweep saves pending changes", async () => {
        const _id = await makeUser();
        queueUserChange(_id, { name: "Swept" });

        startUserSaveTimer(20);
        await tick(150);

        expect((await readUser(_id))?.name).toBe("Swept");
    });
});
