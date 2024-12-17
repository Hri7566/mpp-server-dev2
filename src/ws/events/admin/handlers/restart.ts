import { ServerEventListener } from "~/util/types";
import { socketsByUUID } from "~/ws/Socket";

let timeout: Timer | undefined;

export const restart: ServerEventListener<"restart"> = {
    id: "restart",
    callback: async (msg, socket) => {
        // Restart server
        if (typeof timeout !== "undefined") {
            return;
        }

        // Let everyone know
        for (const sock of socketsByUUID.values()) {
            sock.sendNotification({
                id: "server-restart",
                target: "#piano",
                duration: 20000,
                class: "classic",
                title: "Server Restart",
                text: "The server is restarting soon."
            });
        }

        timeout = setTimeout(() => {
            // Stop the program
            process.exit();
        }, 20000);
    }
};
