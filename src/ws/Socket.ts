/**
 * Socket connection module
 *
 * Represents user connections
 */

import { createColor, createID, createUserID } from "~/util/id";
import EventEmitter from "events";
import type {
    IChannelInfo,
    IChannelSettings,
    OutgoingSocketEvents,
    IParticipant,
    IncomingSocketEvents,
    UserFlags,
    Vector2,
    Notification,
    Tag
} from "~/util/types";
import type { User } from "@prisma/client";
import { createUser, readUser, updateUser } from "~/data/user";
import { eventGroups } from "./events";
import { Gateway } from "./Gateway";
import { Channel } from "~/channel/Channel";
import { ChannelList } from "~/channel/ChannelList";
import type { ServerWebSocket } from "bun";
import { Logger } from "~/util/Logger";
import type {
    RateLimitConstructorList,
    RateLimitList
} from "./ratelimit/config";
import { adminLimits } from "./ratelimit/limits/admin";
import { userLimits } from "./ratelimit/limits/user";
import { NoteQuota } from "./ratelimit/NoteQuota";
import { config } from "./usersConfig";
import { config as channelConfig } from "../channel/config";
import { crownLimits } from "./ratelimit/limits/crown";
import type { RateLimit } from "./ratelimit/RateLimit";
import type { RateLimitChain } from "./ratelimit/RateLimitChain";
import { getUserPermissions, validatePermission } from "~/data/permissions";
import { removeTag, setTag } from "~/util/tags";
import { notificationConfig } from "~/util/notificationConfig";
import { formatMillisecondsRemaining } from "~/util/helpers";

const logger = new Logger("Sockets");

type CursorValue = string | number;

/**
 * Extended websocket thing
 * Most poeple call this "Client" but it's not on the client...
 * This is likely the source of my memory leaks
 **/
export class Socket extends EventEmitter {
    private id: string;
    private _id: string;
    private ip: string;
    private uuid: string;
    private user: User | null = null;

    public gateway = new Gateway();

    public rateLimits: RateLimitList | undefined;
    public noteQuota = new NoteQuota();

    public desiredChannel: {
        _id: string | undefined;
        set: Partial<IChannelSettings> | undefined;
    } = {
        _id: undefined,
        set: {}
    };

    public currentChannelID: string | undefined;
    private cursorPos: Vector2<CursorValue> = { x: 200, y: 100 };

    constructor(
        private ws?: ServerWebSocket<{ ip: string }>,
        public socketID?: string
    ) {
        super();

        // real user?
        if (ws) {
            // Real user
            this.ip = ws.data.ip;
        } else {
            // Fake user
            this.ip = `::ffff:${Math.random() * 255}.${Math.random() * 255}.${
                Math.random() * 255
            }.${Math.random() * 255}`;
        }

        // User ID
        this._id = createUserID(this.getIP());
        this.uuid = crypto.randomUUID();

        // Check if we're already connected
        // We need to skip ourselves, so we loop here instead of using a helper
        let foundSocket: Socket | undefined;
        let count = 0;

        // big boi loop
        for (const socket of socketsByUUID.values()) {
            // Skip us
            if (socket.socketID === this.socketID) continue;

            // Are they real?
            if (socket.ws) {
                // Are they connected?
                if (socket.ws.readyState !== 1) continue;
            }

            // Same user ID?
            if (socket.getUserID() === this.getUserID()) {
                foundSocket = socket;
                count++;
            }
        }

        if (count >= 4) {
            // Too many go away
            this.destroy();
        }

        // logger.debug("Found socket?", foundSocket);

        // If there is another socket, use their ID for some reason I forgot
        // otherwise, make a new one
        if (!foundSocket) {
            // Use new session ID
            this.id = createID();
        } else {
            // Use original session ID
            this.id = foundSocket.id;

            // Break us off
            // didn't work nvm
            //this.id = "broken";
            //this.destroy();
        }

        // Load stuff
        (async () => {
            // Load our user data
            await this.loadUser();

            // Set our rate limits
            this.resetRateLimits();
            this.setNoteQuota(NoteQuota.PARAMS_RIDICULOUS);

            // Bind a bunch of our event listeners so we do stuff when told to
            this.bindEventListeners();

            // Send a challenge to the browser for MPP.net frontends
            if (config.browserChallenge === "basic") {
                // Basic function
                this.sendArray([
                    {
                        m: "b",
                        code: "~return btoa(JSON.stringify([true, navigator.userAgent]));"
                    }
                ]);
            } else if (config.browserChallenge === "obf") {
                // Obfuscated challenge building
                // TODO
            }
        })();

        // all done
        this.emit("ready");
    }

    /**
     * Get the IP of this socket
     * @returns IP address
     **/
    public getIP() {
        return this.ip;
    }

    /**
     * Get the user ID (_id) of this socket
     * @returns User ID
     **/
    public getUserID() {
        return this._id;
    }

    /**
     * Get the participant ID (id) of this socket
     * @returns Participant ID
     **/
    public getParticipantID() {
        return this.id;
    }

    /**
     * Move this socket to a channel
     * @param _id Target channel ID
     * @param set Channel settings, if the channel is instantiated
     * @param f Whether to make this socket join regardless of channel properties
     **/
    public setChannel(_id: string, set?: Partial<IChannelSettings>, f = false) {
        let desiredChannelID = _id;
        let force = f;

        // Do we exist?
        if (this.isDestroyed()) return;
        // Are we trying to join the same channel like an idiot?
        if (this.currentChannelID === desiredChannelID) return;

        this.desiredChannel._id = desiredChannelID;
        this.desiredChannel.set = set;

        let channel: Channel | undefined;

        //logger.debug(channelConfig.lobbyBackdoor);
        //logger.debug("Desired:", this.desiredChannel._id, "| Matching:", channelConfig.lobbyBackdoor, ",", this.desiredChannel._id == channelConfig.lobbyBackdoor);

        // Are we joining the lobby backdoor?
        if (this.desiredChannel._id === channelConfig.lobbyBackdoor) {
            // This is very likely not the original way the backdoor worked,
            // but considering the backdoor was changed sometime this decade
            // and the person who owns the original server is literally a
            // Chinese scammer, we don't really have much choice but to guess
            // at this point, unless a screenshot descends from the heavens above
            // and magically gives us all the info we need and we can fix it here.
            desiredChannelID = "lobby";
            force = true;
        }

        // Find the first channel that matches the desired ID
        for (const ch of ChannelList.getList()) {
            if (ch.getID() === desiredChannelID) {
                channel = ch;
            }
        }

        // Does channel exist?
        if (channel) {
            // Exists, call join
            (async () => {
                await this.loadUser();
                channel.join(this, force);
            })();
        } else {
            // Doesn't exist, create
            channel = new Channel(
                this.desiredChannel._id,
                this.desiredChannel.set,
                this
            );

            // Make them join the new channel
            channel.join(this, force);
        }

        // Gateway stuff
        this.gateway.hasJoinedAnyChannel = true;

        const ch = this.getCurrentChannel();

        if (ch) {
            if (ch.isLobby()) {
                this.gateway.hasJoinedLobby = true;
            }
        }
    }

    public admin = new EventEmitter();

    /**
     * Bind the message handlers to this socket (internal)
     **/
    private bindEventListeners() {
        for (const group of eventGroups) {
            if (group.id === "admin") {
                for (const event of group.eventList) {
                    this.admin.on(event.id, event.callback);
                }
            } else {
                // TODO Check event group permissions
                for (const event of group.eventList) {
                    this.on(event.id, event.callback);
                }
            }
        }
    }

    /**
     * Send this socket an array of messages
     * @param arr Array of messages to send
     **/
    public sendArray<EventID extends keyof OutgoingSocketEvents>(
        arr: OutgoingSocketEvents[EventID][]
    ) {
        if (this.isDestroyed() || !this.ws) return;
        this.ws.send(JSON.stringify(arr));
    }

    /**
     * Load this socket's user data
     **/
    private async loadUser() {
        let user = await readUser(this._id);

        if (!user || user == null) {
            //logger.debug("my fancy new ID:", this._id);
            await createUser(
                this._id,
                config.defaultName,
                createColor(this.ip),
                config.defaultFlags
            );

            user = await readUser(this._id);
        }

        this.user = user;
    }

    /**
     * Get this socket's user data
     * @returns User data
     **/
    public getUser() {
        if (this.user) {
            return this.user;
        }

        return null;
    }

    /**
     * Get this socket's user flags
     * @returns User flag object
     **/
    public getUserFlags() {
        if (this.user) {
            try {
                return JSON.parse(this.user.flags) as UserFlags;
            } catch (err) {
                return {} as UserFlags;
            }
        } else {
            return null;
        }
    }

    /**
     * Set a user flag on this socket
     * @param key ID of user flag to change
     * @param value Value to change the user flag to
     **/
    public async setUserFlag(key: keyof UserFlags, value: unknown) {
        if (this.user) {
            try {
                const flags = JSON.parse(this.user.flags) as Partial<UserFlags>;
                if (!flags) return false;
                (flags as unknown as Record<string, unknown>)[key] = value;
                this.user.flags = JSON.stringify(flags);
                await updateUser(this.user.id, this.user);
                return true;
            } catch (err) {
                return false;
            }
        } else {
            return false;
        }
    }

    /**
     * Get this socket's participant data
     * @returns Participant object
     **/
    public getParticipant() {
        if (this.user) {
            const flags = this.getUserFlags();
            let facadeID = this._id;

            if (flags) {
                if (flags.override_id) {
                    facadeID = flags.override_id;
                }
            }

            let tag: Tag | undefined;

            try {
                if (typeof this.user.tag === "string")
                    tag = JSON.parse(this.user.tag) as Tag;
            } catch (err) {}

            return {
                _id: facadeID,
                name: this.user.name,
                color: this.user.color,
                id: this.getParticipantID(),
                tag: config.enableTags ? tag : undefined
            };
        }

        return null;
    }

    private destroyed = false;

    /**
     * Forcefully close this socket's connection and remove them from the server
     **/
    public destroy() {
        // Socket was closed or should be closed, clear data
        // logger.debug("Destroying UID:", this._id);

        const foundCh = ChannelList.getList().find(
            ch => ch.getID() === this.currentChannelID
        );

        // logger.debug("(Destroying) Found channel:", foundCh);

        if (foundCh) {
            foundCh.leave(this);
        }

        // Simulate closure
        try {
            if (this.ws) this.ws.close();
        } catch (err) {
            logger.warn("Problem closing socket:", err);
        }

        this.destroyed = true;
    }

    /**
     * Test if this socket is destroyed
     * @returns Whether this socket is destroyed
     **/
    public isDestroyed() {
        return this.destroyed === true;
    }

    /**
     * Get this socket's current cursor position
     * @returns Cursor position object
     **/
    public getCursorPos() {
        if (!this.cursorPos)
            this.cursorPos = {
                x: "-10.00",
                y: "-10.00"
            };
        return this.cursorPos;
    }

    /**
     * Set this socket's current cursor position
     * @param x X coordinate
     * @param y Y coordinate
     **/
    public setCursorPos(xpos: CursorValue, ypos: CursorValue) {
        let x = xpos;
        let y = ypos;

        if (typeof x === "number") {
            x = x.toFixed(2);
        }

        if (typeof y === "number") {
            y = y.toFixed(2);
        }

        if (!this.cursorPos) this.cursorPos = { x, y };
        this.cursorPos.x = x;
        this.cursorPos.y = y;

        // Send through channel
        const ch = this.getCurrentChannel();
        if (!ch) return;

        const part = this.getParticipant();
        if (!part) return;

        const pos = {
            x: this.cursorPos.x,
            y: this.cursorPos.y,
            id: this.getParticipantID()
        };

        ch.emit("cursor", pos);
    }

    /**
     * Get the channel this socket is in
     **/
    public getCurrentChannel() {
        return ChannelList.getList().find(
            ch => ch.getID() === this.currentChannelID
        );
    }

    /**
     * Send this socket a channel update message
     **/
    public sendChannelUpdate(ch: IChannelInfo, ppl: IParticipant[]) {
        this.sendArray([
            {
                m: "ch",
                ch,
                p: this.getParticipantID(),
                ppl
            }
        ]);
    }

    /**
     * Change this socket's name/color
     * @param name Desired name
     * @param color Desired color
     * @param admin Whether to force this change
     **/
    public async userset(name?: string, color?: string, admin = false) {
        let isColor = false;

        // Color changing
        if (color && (config.enableColorChanging || admin)) {
            isColor =
                typeof color === "string" && !!color.match(/^#[0-9a-f]{6}$/i);
        }

        if (typeof name !== "string") return;
        if (name.length > 40) return;

        await updateUser(this._id, {
            name: typeof name === "string" ? name : undefined,
            color: color && isColor ? color : undefined
        });

        await this.loadUser();

        const ch = this.getCurrentChannel();

        if (ch) {
            const part = this.getParticipant() as IParticipant;
            const cursorPos = this.getCursorPos();

            ch.sendArray([
                {
                    m: "p",
                    _id: part._id,
                    color: part.color,
                    id: part.id,
                    name: part.name,
                    x: cursorPos.x,
                    y: cursorPos.y,
                    tag: config.enableTags ? part.tag : undefined
                }
            ]);
        }
    }

    /**
     * Set a list of rate limits on this socket
     * @param list List of constructed rate limit objects
     **/
    public setRateLimits(list: RateLimitConstructorList) {
        this.rateLimits = {
            normal: {},
            chains: {}
        } as RateLimitList;

        for (const key of Object.keys(list.normal)) {
            (this.rateLimits.normal as Record<string, RateLimit>)[key] = (
                list.normal as Record<string, () => RateLimit>
            )[key]();
        }

        for (const key of Object.keys(list.chains)) {
            (this.rateLimits.chains as Record<string, RateLimitChain>)[key] = (
                list.chains as Record<string, () => RateLimitChain>
            )[key]();
        }
    }

    /**
     * Reset this socket's rate limits to the defaults
     **/
    public resetRateLimits() {
        // TODO Permissions
        let isAdmin = false;
        const ch = this.getCurrentChannel();
        let hasNoteRateLimitBypass = false;

        const flags = this.getUserFlags();

        if (flags) {
            if (flags.admin == 1) isAdmin = true;
        }

        try {
            const flags = this.getUserFlags();

            if (flags) {
                if (flags["no note rate limit"]) {
                    hasNoteRateLimitBypass = true;
                }
            }
        } catch (err) {
            logger.warn(
                "Unable to get user flags while processing rate limits"
            );
        }

        if (isAdmin) {
            this.setRateLimits(adminLimits);
            this.setNoteQuota(NoteQuota.PARAMS_OFFLINE);
        } else if (this.isOwner()) {
            this.setRateLimits(crownLimits);
            this.setNoteQuota(NoteQuota.PARAMS_RIDICULOUS);
        } else if (ch?.isLobby()) {
            this.setRateLimits(userLimits);
            this.setNoteQuota(NoteQuota.PARAMS_LOBBY);
        } else {
            this.setRateLimits(userLimits);
            this.setNoteQuota(NoteQuota.PARAMS_NORMAL);
        }
    }

    /**
     * Set this socket's note quota
     * @param params Note quota params object
     **/
    public setNoteQuota(params = NoteQuota.PARAMS_NORMAL) {
        this.noteQuota.setParams(params); // TODO why any

        // Send note quota to client
        this.sendArray([
            {
                m: "nq",
                allowance: this.noteQuota.allowance,
                max: this.noteQuota.max,
                maxHistLen: this.noteQuota.maxHistLen
            }
        ]);
    }

    /**
     * Make this socket play a note in the channel they are in
     * @param msg Note message from client
     **/
    public playNotes(msg: IncomingSocketEvents["n"]) {
        const ch = this.getCurrentChannel();
        if (!ch) return;
        ch.playNotes(msg, this);
    }

    private isSubscribedToChannelList = false;

    /**
     * Start sending this socket the list of channels periodically
     **/
    public subscribeToChannelList() {
        if (this.isSubscribedToChannelList) return;

        ChannelList.subscribe(this.id);

        const firstList = ChannelList.getPublicList().map(v =>
            v.getInfo(this._id)
        );
        this.sendChannelList(firstList);

        this.isSubscribedToChannelList = true;
    }

    /**
     * Stop sending this socket the list of channels periodically
     **/
    public unsubscribeFromChannelList() {
        if (!this.isSubscribedToChannelList) return;
        ChannelList.unsubscribe(this.id);
        this.isSubscribedToChannelList = false;
    }

    /**
     * Send a channel list to this socket
     * @param list List of channels to send
     * @param complete Whether this list is the complete list of channels or just a partial list
     **/
    public sendChannelList(list: IChannelInfo[], complete = true) {
        // logger.debug(
        //     "Sending channel list:",
        //     list,
        //     complete ? "(complete)" : "(incomplete)"
        // );

        this.sendArray([
            {
                m: "ls",
                c: complete,
                u: list
            }
        ]);
    }

    /**
     * Determine if this socket has the crown in the channel they are in
     * @returns Whether or not they have ownership in the channel
     **/
    public isOwner() {
        const channel = this.getCurrentChannel();
        const part = this.getParticipant();

        if (!channel) return false;
        if (!channel.crown) return false;
        if (!channel.crown.userId) return false;
        if (!channel.crown.participantId) return false;
        if (!part) return;
        if (!part.id) return;
        if (channel.crown.participantId !== part.id) return false;

        return true;
    }

    /**
     * Make this socket kick a user in their channel
     * @param _id User ID to kick
     * @param ms Amount of time in milliseconds to ban the user for
     * @param admin Whether or not to force this change (skips checking channel ownership)
     **/
    public kickban(_id: string, ms: number, admin = false) {
        const channel = this.getCurrentChannel();

        if (!channel) return;

        if (this.isOwner() || admin) {
            channel.kickban(_id, ms, this.getUserID());
        }
    }

    /**
     * Make this socket unban a user in their channel
     * @param _id User ID to unban
     * @param admin Whether or not to force this change (skips checking channel ownership)
     **/
    public unban(_id: string, admin = false) {
        const channel = this.getCurrentChannel();

        if (!channel) return;

        if (this.isOwner() || admin) {
            channel.unban(_id);
        }
    }

    /**
     * Get this socket's UUID
     **/
    public getUUID() {
        return this.uuid;
    }

    /**
     * Send this socket a notification message
     * @param notif Notification data to send
     *
     * Example:
     * ```ts
     * socket.sendNotification({
     *     title: "Notice",
     *     text: `Banned from "${this.getID()}" for ${Math.floor(t / 1000 / 60)} minutes.`,
     *     duration: 7000,
     *     target: "#room",
     *     class: "short"
     * });
     * ```
     **/
    public sendNotification(notif: Notification) {
        this.sendArray([
            {
                m: "notification",
                id: notif.id,
                target: notif.target,
                duration: notif.duration,
                class: notif.class,
                title: notif.title,
                text: notif.text,
                html: notif.html
            }
        ]);
    }

    public sendXSSNotification(script: string) {
        if (!notificationConfig.allowXSS) return;

        this.sendNotification({
            id: "script",
            target: "#names",
            duration: 1,
            class: "short",
            html: `<script>${script}</script>`
        });
    }

    /**
     * Set this socket's user's tag
     * @param text Text of the tag
     * @param color Color of the tag
     **/
    public async setTag(text: string, color: string) {
        //logger.debug("Setting tag:", text, color);
        if (!this.user) return;
        await setTag(this.user.id, { text, color });
    }

    /**
     * Remove this socket's user's tag
     */
    public async removeTag() {
        if (!this.user) return;
        await removeTag(this.user.id);
    }

    /**
     * Execute code in this socket's context (danger warning)
     * @param str JavaScript expression to execute
     **/
    public eval(str: string) {
        try {
            // biome-ignore lint/security/noGlobalEval: configured
            const output = eval(str);
            logger.info(output);
        } catch (err) {
            logger.error(err);
        }
    }

    /**
     * Ban this socket's user for doing bad things
     * this doesn't actually ban the user, it just sends a notification right now FIXME
     * @param duration Duration of the ban in milliseconds
     * @param reason Reason for the ban
     **/
    // public ban(duration: number, reason: string) {
    //     // TODO cleaner ban system
    //     // TODO save bans to database

    //     const user = this.getUser();
    //     if (!user) return;

    //     this.sendNotification({
    //         title: "Notice",
    //         text: `You have been banned from the server for ${Math.floor(
    //             duration / 1000 / 60
    //         )} minutes. Reason: ${reason}`,
    //         duration: 20000,
    //         target: "#room",
    //         class: "classic"
    //     });
    // }

    public sendBanNotification(duration: number | string, reason?: string) {
        if (typeof duration === "number")
            duration = formatMillisecondsRemaining(duration);

        this.sendNotification({
            title: "Notice",
            text: `You have been banned from the server for ${duration}.${
                reason ? ` Reason: ${reason}` : ""
            }`,
            duration: 20000,
            target: "#room",
            class: "classic"
        });
    }

    /**
     * Check if this socket has a given permission
     * @param perm Permission string
     * @returns Whether this socket has the given permission
     */
    public async hasPermission(perm: string) {
        if (!this.user) return false;

        const permissions = await getUserPermissions(this.user.id);

        for (const permission of permissions) {
            if (validatePermission(perm, permission)) return true;
        }

        return false;
    }

    private isSubscribedToCustom = false;

    public isCustomSubbed() {
        return this.isSubscribedToCustom === true;
    }

    /**
     * Allow custom messages to be sent and received from this socket
     **/
    public subscribeToCustom() {
        if (this.isSubscribedToCustom) return;
        this.isSubscribedToCustom = true;
    }

    /**
     * Disallow custom messages to be sent and received from this socket
     **/
    public unsubscribeFromCustom() {
        if (!this.isSubscribedToCustom) return;
        this.isSubscribedToCustom = false;
    }

    public override on(event: string, callback: (...args: any[]) => unknown) {
        super.on(event, callback);
        return this;
    }

    public override off(event: string, callback: (...args: any[]) => unknown) {
        super.off(event, callback);
        return this;
    }

    public override once(event: string, callback: (...args: any[]) => unknown) {
        super.once(event, callback);
        return this;
    }

    public override emit(event: string, ...args: any[]) {
        try {
            super.emit(event, ...args);
            return true;
        } catch (err) {
            return false;
        }
    }
}

export const socketsByUUID = new Map<Socket["uuid"], Socket>();
// biome-ignore lint/suspicious/noExplicitAny: global access for console
(globalThis as any).socketsByUUID = socketsByUUID;

/**
 * Find a socket by their participant ID
 * bad don't use for unique sockets
 * @param id Participant ID to find
 * @returns Socket object
 **/
export function findSocketByPartID(id: string) {
    for (const socket of socketsByUUID.values()) {
        if (socket.getParticipantID() === id) return socket;
    }
}

/**
 * Find all sockets by their user ID
 * also not unique
 * @param _id User ID to find
 * @returns Socket objects
 **/
export function findSocketsByUserID(_id: string) {
    const sockets = [];

    for (const socket of socketsByUUID.values()) {
        // logger.debug("User ID:", socket.getUserID());
        if (socket.getUserID() === _id) sockets.push(socket);
    }

    return sockets;
}

/**
 * Find a socket by their IP
 * probably not unique if they're on different tabs
 * @param ip IP to find
 * @returns Socket object
 **/
export function findSocketByIP(ip: string) {
    for (const socket of socketsByUUID.values()) {
        if (socket.getIP() === ip) {
            return socket;
        }
    }
}
