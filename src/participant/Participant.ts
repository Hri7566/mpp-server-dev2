import EventEmitter from "node:events";
import type {
    IParticipant,
    IUser,
    SocketEvents,
    SocketMessages,
    UserFlags,
    Vector2
} from "~/util/types";
import type { Socket } from "~/ws/Socket";
import { readUser, createUser, updateUser } from "~/data/user";
import { createID, createUserIDFromIP, createColor } from "~/util/id";
import { spoop_text } from "~/util/helpers";
import { config } from "./config";
import type { Channel } from "~/channel";
import type { User } from "@prisma/client";
import { bus } from "~/events/bus";

export type IUserWithFlags = IUser & { flags?: UserFlags };

type CursorValue = string | number;

const BANNED_WORDS = ["AMIGHTYWIND", "CHECKLYHQ"];

/**
 * A user's presence in a channel.
 *
 * One participant can have multiple sockets (tabs) attached to it,
 * as long as they are all in the same channel.
 */
export class Participant extends EventEmitter {
    public static cache = new Map<Participant["id"], Participant>();

    public static convertUser(user: User): IUserWithFlags {
        let tag: IUser["tag"];
        let flags: UserFlags | undefined;

        try {
            const t = user.tag ? JSON.parse(user.tag) : undefined;
            if (t && typeof t.text === "string" && typeof t.color === "string")
                tag = { text: t.text, color: t.color };
        } catch (err) {}

        try {
            flags = user.flags ? JSON.parse(user.flags) : undefined;
        } catch (err) {}

        return {
            _id: user.id,
            name: user.name,
            color: user.color,
            tag,
            flags
        };
    }

    public static get(id: string) {
        return this.cache.get(id);
    }

    public static getByUserID(_id: string) {
        return [...this.cache.values()].filter(p => p.user._id === _id);
    }

    public destroyed = false;
    public sockets = new Set<Socket>();
    public id = createID();
    public cursorPos: Vector2<CursorValue> = { x: "-10.00", y: "-10.00" };
    public loaded = false;
    public channel?: Channel;

    public user: IUserWithFlags = {
        _id: "",
        name: config.defaultName,
        color: "#777",
        flags: config.defaultFlags
    };

    private loadPromise?: Promise<IUserWithFlags>;

    /**
     * @param socket First socket attached to this participant
     * @param user Already-loaded user data (skips loading from the database)
     */
    constructor(socket?: Socket, user?: IUserWithFlags) {
        super();

        if (socket) this.addSocket(socket);

        if (user) {
            this.user = { ...user };
            this.loaded = true;
            this.loadPromise = Promise.resolve(this.user);
        }

        Participant.cache.set(this.id, this);
        bus.on("user data update", this.onUserDataUpdate);
    }

    private onUserDataUpdate = (user: User | null) => {
        if (!user || user.id !== this.user._id) return;
        this.user = Participant.convertUser(user);
        this.loaded = true;
        if (this.channel) this.channel.sendParticipantUpdate(this);
        for (const s of this.sockets) s.resetRateLimits();
    };

    /**
     * Whether this participant should be hidden from other users
     */
    public get vanished() {
        return !!this.user.flags?.vanish;
    }

    /**
     * Get the public representation of this participant
     */
    public simple(): IParticipant & { vanished?: boolean } {
        let _id = this.user._id;
        if (typeof this.user.flags?.override_id === "string")
            _id = this.user.flags.override_id;

        return {
            id: this.id,
            _id,
            name: this.user.name,
            color: this.user.color,
            tag: config.enableTags ? this.user.tag : undefined,
            vanished: this.vanished || undefined
        };
    }

    public addSocket(socket: Socket) {
        this.sockets.add(socket);
        socket.participant = this;
    }

    public removeSocket(socket: Socket) {
        this.sockets.delete(socket);
        if (socket.participant === this) socket.participant = undefined;
        if (this.sockets.size < 1) this.destroy();
    }

    /**
     * Load user data from the database (only once, unless forced)
     */
    public loadUser(force = false) {
        if (this.loadPromise && !force) return this.loadPromise;
        this.loadPromise = this.readUser();
        return this.loadPromise;
    }

    private async readUser() {
        const socket = [...this.sockets][0];

        const _id =
            socket?.userID ?? (socket ? createUserIDFromIP(socket.ip) : createID());
        let user = await readUser(_id);

        if (!user) {
            // User doesn't exist yet, create a new one
            await createUser(
                _id,
                config.defaultName,
                createColor(socket ? socket.ip : _id),
                config.defaultFlags
            );

            user = await readUser(_id);
        }

        if (user) {
            this.user = Participant.convertUser(user);
        } else {
            this.user = {
                _id,
                name: config.defaultName,
                color: createColor(socket ? socket.ip : _id),
                flags: config.defaultFlags
            };
        }

        this.loaded = true;
        this.emit("load", this.user);
        return this.user;
    }

    public destroy() {
        if (this.destroyed) return;
        this.destroyed = true;

        bus.off("user data update", this.onUserDataUpdate);
        if (this.channel) this.channel.removeParticipant(this);
        Participant.cache.delete(this.id);
        this.removeAllListeners();
    }

    /**
     * Send messages to every socket attached to this participant
     * @param arr Messages to send
     * @param blockUUID Socket UUID to skip
     */
    public sendArray<EventID extends keyof SocketEvents>(
        arr: SocketEvents[EventID][],
        blockUUID?: Socket["uuid"]
    ) {
        for (const s of this.sockets) {
            if (s.uuid === blockUUID) continue;
            s.sendArray(arr);
        }
    }

    /**
     * Whether this participant is wearing the crown in their channel
     */
    public isOwner() {
        const crown = this.channel?.crown;
        if (!crown || !crown.participantId) return false;
        return crown.participantId === this.id;
    }

    public setCursorPos(xpos: CursorValue, ypos: CursorValue) {
        const x = typeof xpos === "number" ? xpos.toFixed(2) : xpos;
        const y = typeof ypos === "number" ? ypos.toFixed(2) : ypos;

        this.cursorPos = { x, y };

        if (this.channel) this.channel.emit("cursor", { x, y, id: this.id });
    }

    public chat(msg: SocketMessages["a"]) {
        if (typeof msg.message !== "string") return;
        if (!this.channel) return;

        const flags = this.user.flags ?? {};
        if (flags.cant_chat === 1) return;

        let message = msg.message;

        if (flags.chat_curse_1 === 1)
            message = message.replace(/[aeiu]/g, "o").replace(/[AEIU]/g, "O");
        if (flags.chat_curse_2 === 1) message = spoop_text(message);

        const squashed = message.toLowerCase().split(" ").join("");
        for (const word of BANNED_WORDS) {
            if (squashed.includes(word.toLowerCase())) return;
        }

        const p = this.simple();
        if (typeof flags.chat_color === "string") p.color = flags.chat_color;

        this.channel.chat({ m: "a", message }, p);
    }

    public async userset(name?: string, color?: string, force = false) {
        // User ID isn't known until the user has loaded
        if (!this.loaded || !this.user._id) return;

        if (typeof name !== "undefined") {
            if (typeof name !== "string") return;
            if (name.length > 40) return;
        }

        let isColor = false;
        if (typeof color === "string" && (config.enableColorChanging || force))
            isColor = !!color.match(/^#[0-9a-f]{6}$/i);

        const user = await updateUser(this.user._id, {
            name,
            color: isColor ? color : undefined
        });

        // Propagates to every participant with this user ID
        bus.emit("user data update", user);
    }
}

export default Participant;
