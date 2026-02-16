import { ChannelList } from "~/channel/ChannelList";
import { readUser, updateUser } from "~/data/user";
import { Participant } from "~/participant";
import { Logger } from "~/util/Logger";
import { ServerEventListener } from "~/util/types";

const logger = new Logger("User flag handler");

export const user_flag: ServerEventListener<"user_flag"> = {
    id: "user_flag",
    callback: async (msg, socket) => {
        // User flag modification (changing some real specific shit)
        if (typeof msg._id !== "string") return;
        if (typeof msg.key !== "string") return;
        if (
            typeof msg.remove !== "boolean" &&
            typeof msg.value == "undefined"
        ) {
            return;
        }

        // socket.getCurrentChannel()?.logger.debug(msg);

        // Find the user data we're modifying
        const user = await readUser(msg._id);
        if (!user) return;

        // Set the flag
        const flags = JSON.parse(user.flags);

        if (msg.remove === true) {
            delete flags[msg.key];
        } else {
            flags[msg.key] = msg.value;
        }

        user.flags = JSON.stringify(flags);

        // Save the user data
        await updateUser(user.id, user);

        // Update this data for loaded users as well
        for (const p of Participant.cache.values()) {
            if (p.user._id !== msg._id) continue;

            if (typeof p.user.flags === "object")
                (p.user.flags as { [key: string]: unknown })[msg.key] =
                    msg.value;
        }

        for (const ch of ChannelList.getList()) {
            // TODO: review this
            ch.emit("user data update", user);
        }
    }
};
