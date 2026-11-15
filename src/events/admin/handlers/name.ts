import { bus } from "~/events/bus";
import { readUser, updateUser } from "~/data/user";
import { ServerEventListener } from "~/util/types";

export const name: ServerEventListener<"name"> = {
    id: "name",
    callback: async (msg, socket) => {
        // Change someone else's name but it's an annoying admin feature
        const id = msg._id;
        const name = msg.name;

        if (typeof id !== "string") return;
        if (typeof name !== "string") return;

        const user = await readUser(msg._id);
        if (!user) return;

        user.name = name;
        bus.emit("user data update", await updateUser(id, user));
    }
};
