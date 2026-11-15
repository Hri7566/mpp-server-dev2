import { ServerEventListener } from "~/util/types";
import { Socket } from "~/ws/Socket";
import { flushAllUsers } from "~/participant/userSaves";

let timeout: Timer | undefined;
const timeoutTime = 20000;

export const restart: ServerEventListener<"restart"> = {
    id: "restart",
    callback: async (msg, socket) => {
        // Restart server
        if (typeof timeout !== "undefined") return;

        // Let everyone know
        for (const sock of Socket.sockets.values()) {
            sock.sendNotification({
                id: "server-restart",
                target: "#piano",
                duration: timeoutTime,
                class: "classic",
                title: "Server Restart",
                text: "The server is restarting soon."
            });
        }

        timeout = setTimeout(async () => {
            // Save unsaved name/color changes, then stop the program
            await flushAllUsers().catch(() => {});
            process.exit();
        }, timeoutTime);
    }
};
