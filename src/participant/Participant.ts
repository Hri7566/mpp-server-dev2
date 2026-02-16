import EventEmitter from "node:events";
import type {
    IChannelSettings,
    IParticipant,
    IUser,
    SocketEvents,
    SocketMessages,
    UserFlags,
    Vector2
} from "~/util/types";
import { Socket } from "~/ws/Socket";
import { readUser, createUser, updateUser } from "~/data/user";
import { createID, createUserIDFromIP, createColor } from "~/util/id";
import { config } from "./config";
import { Channel, validateChannelSetting } from "~/channel";
import type { User } from "@prisma/client";
import { ChannelList } from "~/channel/ChannelList";

type IUserWithFlags = IUser & { flags?: UserFlags };

export class Participant extends EventEmitter {
    public static cache = new Map<Participant["id"], Participant>();

    public static convertUser(user: User): IUserWithFlags {
        let tag = user.tag ? JSON.parse(user.tag) : undefined;
        let flags = user.flags ? JSON.parse(user.flags) : undefined;

        return {
            _id: user.id,
            name: user.name,
            color: user.color,
            tag: tag
                ? {
                      text: tag.text,
                      color: tag.color
                  }
                : undefined,
            flags
        };
    }

    public static get(id: string) {
        return this.cache.get(id)?.proxy;
    }

    // index signatures my beloved
    [key: string]: unknown;
    public destroyed = false;
    public sockets = new Set<Socket>();
    public proxy = new Proxy(this, {});
    public id = createID();
    public cursorPos: Vector2<string | number> = { x: -10, y: -10 };
    public loaded = false;
    public channel?: Channel;

    public user: IUserWithFlags = {
        _id: "",
        name: config.defaultName,
        color: "#777",
        flags: config.defaultFlags
    };

    constructor(socket?: Socket) {
        super();

        if (socket) this.addSocket(socket);
        this.loadUser();

        return this.proxy;
    }

    public simple() {
        return {
            id: this.id,
            _id: this.user._id,
            name: this.user.name,
            color: this.user.color,
            tag: this.user.tag
        } as IParticipant;
    }

    public addSocket(socket: Socket) {
        this.sockets.add(socket);
    }

    public removeSocket(socket: Socket) {
        this.sockets.delete(socket);

        if (this.sockets.size < 1) this.destroy();
    }

    public async loadUser() {
        const socket = [...this.sockets][0];

        let _id = socket ? createUserIDFromIP(socket.ip) : createID();
        let user = await readUser(_id);

        const defaultUser = {
            id: _id,
            name: this.user.name,
            color: createColor(socket ? socket.ip : _id),
            flags: JSON.stringify({}),
            group: "default",
            tag: null
        };

        if (!user || user == null) {
            // User doesn't exist yet, create a new one
            await createUser(
                defaultUser.id,
                defaultUser.name,
                defaultUser.color,
                config.defaultFlags
            );

            user = await readUser(_id);
        }

        user ??= defaultUser;

        this.user = Participant.convertUser(user);
        this.loaded = true;
        this.emit("load", this.user);
    }

    public destroy() {
        this.removeAllListeners();
        if (this.channel) this.channel.removeParticipant(this);
        this.destroyed = true;
    }

    public sendArray(arr: SocketEvents[], blockUUID?: Socket["uuid"]) {
        for (const s of this.sockets.values()) {
            if (s.uuid === blockUUID) continue;
        }
    }

    public chat(msg: SocketMessages["a"]) {
        if (!msg.message) return;
        if (msg.message.length > 512) return;
        if (!this.channel) return;
        if (!this.channel.getSetting("chat")) return; // TODO: add config option to skip this check like mpp.com

        // Sanitize
        msg.message = msg.message
            .replace(/\p{C}+/gu, "")
            .replace(/(\p{Mc}{5})\p{Mc}+/gu, "$1")
            .trim();

        this.channel.sendChatEvent(msg, this.simple());

        //this.sendArray([outgoing]);
        //this.chatHistory.push(outgoing);

        // Limit chat history to 512 messages
        /*
        if (this.chatHistory.length > 512) {
            this.chatHistory.splice(0, this.chatHistory.length - 512);
        }

        await saveChatHistory(this.getID(), this.chatHistory);
        */
    }

    public async userset(name?: string, color?: string) {
        if (name && name.length > 40) return; // TODO config
        let c;
        if (color)
            c = validateChannelSetting(
                color,
                val => typeof val === "string" && !!val.match(/^#[0-9a-f]{6}$/i)
            )
                ? color
                : undefined;

        const user = await updateUser(this.user._id, { name, color });
        this.user = Participant.convertUser(user);
    }

    public setChannel(_id: string, set: Partial<IChannelSettings>) {
        if (this.channel && this.channel.getID() !== _id) {
            this.channel.removeParticipant(this);
        }

        let ch = ChannelList.getChannel(_id);
        if (!ch) ch = new Channel(_id, set);

        this.channel = ch;
        this.channel.addParticipant(this);
    }
}

export default Participant;
