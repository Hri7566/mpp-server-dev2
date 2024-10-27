import { readUser } from "~/data/user";
import { Logger } from "~/util/Logger";
import { setTag } from "~/util/tags";
import { ServerEventListener } from "~/util/types";

const logger = new Logger("tag");

export const tag: ServerEventListener<"tag"> = {
    id: "tag",
    callback: async (msg, socket) => {
        // Remove someone else's tag
        const id = msg._id;
        const tag = msg.tag;

        if (typeof id !== "string") return;

        // Validate tag info
        if (typeof tag !== "object") return;
        if (typeof tag.text !== "string") return;
        if (typeof tag.color !== "string") return;
        //if (!tag.color.match(/^#[0-9a-f]{6}$/i)) return;

        const user = await readUser(msg._id);
        if (!user) return;

        user.tag = JSON.stringify(tag);
        await setTag(id, tag);
    }
};
