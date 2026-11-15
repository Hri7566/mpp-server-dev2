import { bus } from "~/events/bus";
import { readUser, updateUser } from "~/data/user";
import { ServerEventListener } from "~/util/types";
import { discardPendingUserChange } from "~/participant/userSaves";

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

        // Don't let the user's own unsaved name overwrite this later
        discardPendingUserChange(id, ["name"]);
        user.name = name;
        bus.emit("user data update", await updateUser(id, user));
    }
};
