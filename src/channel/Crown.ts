import type { Participant } from "~/participant";
import { IUser, Vector2 } from "~/util/types";
import { Socket } from "~/ws/Socket";

// shiny hat
export class Crown {
    public userId: IUser["_id"] | undefined;
    public participantId: Participant["id"] | undefined;
    public time: number = Date.now();

    public startPos: Vector2 = {
        x: 50,
        y: 50
    };

    public endPos: Vector2 = {
        x: 50,
        y: 50
    };

    public canBeSetBy(part: Participant) {
        // This code is based on Brandon's crown code

        // can claim, drop, or give if...
        const flags = part.user.flags;

        if (!flags) return false;
        if (flags.cansetcrowns) return true;

        const channel = part.channel;
        if (!channel) return false;

        if (!channel.getSetting("lobby")) {
            // if there is no user (never been owned)
            if (!this.userId) return true;

            // if you're the user (you dropped it or left the room, nobody has claimed it)
            if (this.userId === part._id) return true;

            // if there is no participant and 15 seconds have passed
            if (!this.participantId && this.time + 15000 < Date.now())
                return true;

            // you're the specially designated channel owner
            if (channel.getSetting("owner_id") === part._id) return true;
        }

        return false;
    }
}

export default Crown;
