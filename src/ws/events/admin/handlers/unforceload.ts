import { unforceloadChannel } from "~/channel/forceload";
import { ServerEventListener } from "~/util/types";

export const unforceload: ServerEventListener<"unforceload"> = {
    id: "unforceload",
    callback: async (msg, socket) => {
        // Unforceload channel
        if (typeof msg._id !== "string") return;

        unforceloadChannel(msg._id);
    }
};
