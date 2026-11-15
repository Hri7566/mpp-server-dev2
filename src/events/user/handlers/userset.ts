import type { ServerEventListener } from "~/util/types";
import { config } from "~/participant/config";

export const userset: ServerEventListener<"userset"> = {
    id: "userset",
    callback: async (msg, socket) => {
        // Change username/color
        const part = socket.participant;
        if (!part) return;

        if (!part.user.flags?.["no userset rate limit"])
            if (!socket.rateLimits.chains.userset.attempt()) return;

        if (typeof msg.set !== "object") return;

        if (msg.set === null) {
            // TODO: remove in 2027
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

        if (
            typeof msg.set.name !== "undefined" &&
            typeof msg.set.name !== "string"
        )
            return;
        if (
            typeof msg.set.color !== "undefined" &&
            typeof msg.set.color !== "string"
        )
            return;

        if (part.user.flags?.freeze_name) msg.set.name = undefined;

        if (
            typeof msg.set.name === "string" &&
            msg.set.name !== part.user.name
        ) {
            socket.gateway.hasChangedName = true;
        }

        if (
            typeof msg.set.color === "string" &&
            msg.set.color !== part.user.color &&
            config.enableColorChanging
        ) {
            socket.gateway.hasChangedColor = true;
        }

        await part.userset(msg.set.name, msg.set.color);
    }
};
