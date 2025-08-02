import { test, expect } from "bun:test";
import {
    createToken,
    deleteAllTokens,
    deleteToken,
    getTokens,
    getUserIDFromToken
} from "~/util/token";
import { Socket } from "~/ws/Socket";

test("Token read, write, and delete", async () => {
    const socket = new Socket();
    socket.setUserID("potato");

    const t = (await createToken(
        socket.getUserID(),
        socket.gateway,
        "jwt"
    )) as string;
    expect(t).toBeString();

    const t2 = (await createToken(
        socket.getUserID(),
        socket.gateway,
        "uuid"
    )) as string;
    expect(t2).toBeString();

    const id = await getUserIDFromToken(t);
    expect(id).toBe(socket.getUserID());

    const list = (await getTokens(socket.getUserID()))?.map(v => v.token);
    expect(list).toContain(t);
    expect(list).toContain(t2);

    await deleteToken(socket.getUserID(), t);

    const list2 = (await getTokens(socket.getUserID()))?.map(v => v.token);
    expect(list2).not.toContain(t);
    expect(list2).toContain(t2);

    await deleteAllTokens(socket.getUserID());

    const list3 = (await getTokens(socket.getUserID()))?.map(v => v.token);
    expect(list3).not.toContain(t);
    expect(list3).not.toContain(t2);
});
