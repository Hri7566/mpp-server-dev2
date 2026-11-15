import { readUser, updateUser } from "~/data/user";
import { bus } from "~/events/bus";
import { ServerEventListener } from "~/util/types";
import { discardPendingUserChange } from "~/participant/userSaves";

export const color: ServerEventListener<"color"> = {
    id: "color",
    callback: async (msg, socket) => {
        const id = msg._id;
        const color = msg.color;

        if (typeof id !== "string") return;
        if (typeof color !== "string") return;

        const user = await readUser(msg._id);
        if (!user) return;

        // Don't let the user's own unsaved color overwrite this later
        discardPendingUserChange(id, ["color"]);
        user.color = color;
        await updateUser(id, user);
        bus.emit("user data update", await readUser(msg._id));
    }
};
