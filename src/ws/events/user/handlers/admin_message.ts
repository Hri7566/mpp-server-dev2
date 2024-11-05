import env from "~/util/env";
import { ServerEventListener } from "~/util/types";

export const admin_message: ServerEventListener<"admin message"> = {
    id: "admin message",
    callback: async (msg, socket) => {
        // Administrator control message (Brandonism)
        if (socket.rateLimits)
            if (!socket.rateLimits.normal["admin message"].attempt()) return;

        const flags = socket.getUserFlags();

        let hasFlag = false;

        if (flags) {
            // Sometimes we don't use passwords
            if (flags.admin) hasFlag = true;
        }

        if (!hasFlag) {
            // Did they send some kind of password?
            if (typeof msg.password !== "string") {
                socket.gateway.hasSentInvalidAdminMessage = true;
                return;
            }

            // Is the password correct?
            if (msg.password !== env.ADMIN_PASS) {
                socket.gateway.hasSentInvalidAdminMessage = true;
                return;
            }
        }

        // Probably shouldn't be using password auth in 2024
        // Maybe I'll setup a dashboard instead some day
        socket.admin.emit(msg.msg.m, msg.msg, socket, true);
    }
};
