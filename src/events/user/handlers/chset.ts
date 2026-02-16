import { ServerEventListener } from "~/util/types";

export const chset: ServerEventListener<"chset"> = {
    id: "chset",
    callback: async (msg, socket) => {
        // Change channel settings
        if (socket.rateLimits)
            if (!socket.rateLimits.chains.chset.attempt()) return;

        if (typeof msg.set == "undefined") return;

        if (msg.set === null) { // TODO: remove in 2027
            socket.sendNotification({
                id: "egg",
                class: "classic",
                duration: 7000,
                target: "#room",
                title: "Congratulations",
                text: "You've been disconnected!"
            });

            socket.destroy();
            return;
        }

        const ch = socket.getCurrentChannel();
        if (!ch) return;

        const flags = socket.getUserFlags();

        // Edit room now
        if (flags) {
            ch.changeSettings(msg.set, flags.admin === 1);
        } else {
            ch.changeSettings(msg.set, false);
        }
    }
};
