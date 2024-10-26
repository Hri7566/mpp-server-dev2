import { Crown } from "~/channel";
import { Logger } from "~/util/Logger";
import { ServerEventListener } from "~/util/types";

const logger = new Logger("chown");

export const chown: ServerEventListener<"chown"> = {
    id: "chown",
    callback: async (msg, socket) => {
        // Change channel ownership
        if (socket.rateLimits)
            if (!socket.rateLimits.normal["chown"].attempt()) return;

        const ch = socket.getCurrentChannel();
        if (!ch) return;

        let force = false;

        if (!ch.crown) {
            const flags = socket.getUserFlags();

            // doesn't have permission or chowning flag
            if (
                (await socket.hasPermission("chownAnywhere")) ||
                flags?.cansetcrowns === 1
            ) {
                force = true;
            }
        } else {
            if (!ch.crown.canBeSetBy(socket)) return;
        }

        // This user may not always exist,
        // but sometimes we don't provide a user
        // to drop the crown
        let heir = ch.getParticipantList().find(p => p.id == msg.id);
        ch.chown(heir, force);
    }
};
