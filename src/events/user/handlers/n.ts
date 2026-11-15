import { ServerEventListener } from "~/util/types";
import { config } from "~/participant/config";

export const n: ServerEventListener<"n"> = {
    id: "n",
    callback: async (msg, socket) => {
        // Piano note
        if (!socket.rateLimits.chains.n.attempt()) return;

        if (!Array.isArray(msg.n)) return;
        if (typeof msg.t !== "number") return;

        socket.gateway.hasPlayedPianoBefore = true;

        const part = socket.participant;
        if (!part) return;

        const channel = part.channel;
        if (!channel) return;

        // Check note properties
        for (const n of msg.n) {
            if (typeof n !== "object" || n === null) return;
            if (typeof n.n != "string") return;

            if (config.enableCustomNoteData) continue;

            if (n.s) {
                if (typeof n.s !== "number") return;
                if (n.s == 1) {
                    if (typeof n.d !== "number") return;
                    if (n.d < 0 || n.d > 200) return;

                    if (typeof n.v !== "number") return;
                    if (n.v < 0) n.v = 0;
                    if (n.v > 1) n.v = 1;
                }
            }
        }

        const flags = part.user.flags ?? {};

        // Crownsolo is checked in Channel.playNotes
        if (!flags["no note rate limit"] && !flags["no note quota"]) {
            if (!socket.noteQuota.spend(msg.n.length)) return;
        }

        // make noise
        channel.playNotes(msg, socket);
    }
};
