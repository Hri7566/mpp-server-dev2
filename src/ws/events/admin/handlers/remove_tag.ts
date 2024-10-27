import { ChannelList } from "~/channel/ChannelList";
import { readUser, updateUser } from "~/data/user";
import { removeTag } from "~/util/tags";
import { ServerEventListener } from "~/util/types";
import { findSocketsByUserID } from "~/ws/Socket";

export const remove_tag: ServerEventListener<"remove_tag"> = {
    id: "remove_tag",
    callback: async (msg, socket) => {
        // Change someone else's tag
        const id = msg._id;

        if (typeof id !== "string") return;

        // Check if user exists
        const user = await readUser(msg._id);
        if (!user) return;

        await removeTag(msg._id);
    }
};
