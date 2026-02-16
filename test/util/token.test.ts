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
    const part = socket.assignParticipant();

    await new Promise((resolve, reject) => {
        part.once("load", async () => {
            const t = (await createToken(
                part.user._id,
                socket.gateway,
                "jwt"
            )) as string;
            expect(t).toBeString();

            const t2 = (await createToken(
                part.user._id,
                socket.gateway,
                "uuid"
            )) as string;
            expect(t2).toBeString();

            const id = await getUserIDFromToken(t);
            expect(id).toBe(part.user._id);

            const list = (await getTokens(part.user._id))?.map(v => v.token);
            expect(list).toContain(t);
            expect(list).toContain(t2);

            await deleteToken(part.user._id, t);

            const list2 = (await getTokens(part.user._id))?.map(v => v.token);
            expect(list2).not.toContain(t);
            expect(list2).toContain(t2);

            await deleteAllTokens(part.user._id);

            const list3 = (await getTokens(part.user._id))?.map(v => v.token);
            expect(list3).not.toContain(t);
            expect(list3).not.toContain(t2);

            resolve(true);
        });
    });
});
