/**
 * Socket connection module
 *
 * Represents user connections
 */

import EventEmitter from "events";
import type {
    IChannelInfo,
    IChannelSettings,
    Notification,
    SocketEvents
} from "~/util/types";
import { Gateway } from "./Gateway";
import type { ServerWebSocket } from "bun";
import { Logger } from "~/util/Logger";
import crypto from "crypto";
import { Participant } from "~/participant";
import { config } from "~/participant/config";
import { eventGroups } from "~/events";
import { ChannelList } from "~/channel/ChannelList";
import { Channel } from "~/channel";
import { config as channelConfig } from "~/channel/config";
import type {
    RateLimitConstructorList,
    RateLimitList
} from "./ratelimit/config";
import type { RateLimit } from "./ratelimit/RateLimit";
import type { RateLimitChain } from "./ratelimit/RateLimitChain";
import { adminLimits } from "./ratelimit/limits/admin";
import { crownLimits } from "./ratelimit/limits/crown";
import { userLimits } from "./ratelimit/limits/user";
import { NoteQuota } from "./ratelimit/NoteQuota";
import { notificationConfig } from "~/util/notificationConfig";
import { formatMillisecondsRemaining } from "~/util/helpers";
import { getUserPermissions, validatePermission } from "~/data/permissions";
import { flushUser } from "~/participant/userSaves";

const logger = new Logger("Sockets");

/**
 * Extended websocket thing
 * Most poeple call this "Client" but it's not on the client...
 * This is likely the source of my memory leaks
 **/
export class Socket extends EventEmitter {
    public static sockets = new Map<Socket["uuid"], Socket>();

    /**
     * Find a socket by their IP
     * probably not unique if they're on different tabs
     * @param ip IP to find
     * @returns Socket object
     **/
    public static findSocketByIP(ip: string) {
        for (const socket of Socket.sockets.values()) {
            if (socket.ip === ip) {
                return socket;
            }
        }
    }

    /**
     * Find all sockets belonging to a user
     * @param _id User ID
     **/
    public static findSocketsByUserID(_id: string) {
        return [...Socket.sockets.values()].filter(s => s.getUserID() === _id);
    }

    public uuid = crypto.randomUUID();
    public ip: string;
    public participant?: Participant;
    public gateway = new Gateway();

    /** User ID override (set by token auth before the user is loaded) */
    public userID?: string;

    public rateLimits!: RateLimitList;
    public noteQuota = new NoteQuota();

    constructor(private ws?: ServerWebSocket<{ ip: string }>) {
        super();

        Socket.sockets.set(this.uuid, this);

        // real user?
        if (ws) {
            // Real u
            this.ip = ws.data.ip;
        } else {
            // Fake user
            const parts = crypto.randomUUID().split("-");
            this.ip = `::ffff:${parseInt(parts[0], 16) % 255}.${parseInt(parts[1], 16) % 255}.${parseInt(parts[3], 16) % 255}.${parseInt(parts[4], 16) % 255}`;
        }

        this.setRateLimits(userLimits);

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

        // all done
        this.emit("ready");
    }

    public admin = new EventEmitter();

    /**
     * Bind the message handlers to this socket (internal)
     **/
    private bindEventListeners() {
        for (const group of eventGroups) {
            for (const event of group.eventList) {
                const callback = Socket.guardHandler(event.id, event.callback);

                if (group.id == "admin") {
                    this.admin.on(event.id, callback);
                } else {
                    this.on(event.id, callback);
                }
            }
        }
    }

    /**
     * Wrap a message handler so that neither synchronous throws nor
     * rejected promises escape (an unhandled rejection kills the process)
     **/
    private static guardHandler(
        id: string,
        callback: (...args: any[]) => unknown
    ) {
        return (...args: any[]) => {
            try {
                const result = callback(...args);

                if (result instanceof Promise) {
                    result.catch(err => {
                        logger.warn(`Error in "${id}" handler:`, err);
                    });
                }
            } catch (err) {
                logger.warn(`Error in "${id}" handler:`, err);
            }
        };
    }

    /**
     * Send this socket an array of messages
     * @param arr Array of messages to send
     **/
    public sendArray<EventID extends keyof SocketEvents>(
        arr: SocketEvents[EventID][]
    ) {
        if (this.isDestroyed() || !this.ws) return;
        this.ws.send(JSON.stringify(arr));
    }

    private destroyed = false;

    /**
     * Forcefully close this socket's connection and remove them from the server
     **/
    public destroy() {
        if (this.destroyed) return;
        this.destroyed = true;

        const _id = this.getUserID();

        // Socket was closed or should be closed, clear data
        ChannelList.unsubscribe(this);
        if (this.participant) this.participant.removeSocket(this);
        Socket.sockets.delete(this.uuid);

        // Simulate closure
        try {
            if (this.ws) this.ws.close();
        } catch (err) {
            logger.warn("Problem closing socket:", err);
        }

        // Save any name/color changes they made (errors are handled inside)
        if (_id) flushUser(_id);
    }

    /**
     * Test if this socket is destroyed
     * @returns Whether this socket is destroyed
     **/
    public isDestroyed() {
        return this.destroyed === true;
    }

    /**
     * Get this socket's user ID, if known
     **/
    public getUserID() {
        return this.participant?.user._id || this.userID;
    }

    /**
     * Get this socket's user flags
     **/
    public getUserFlags() {
        return this.participant?.user.flags ?? {};
    }

    /**
     * Get the channel this socket is in
     **/
    public getCurrentChannel() {
        return this.participant?.channel;
    }

    /**
     * Whether this socket's participant has the crown
     **/
    public isOwner() {
        return this.participant?.isOwner() ?? false;
    }

    /**
     * Make sure this socket has a participant with loaded user data
     **/
    public async assignParticipant() {
        if (!this.participant) new Participant(this);
        const part = this.participant as unknown as Participant;

        if (!this.isDestroyed()) await part.loadUser();

        // The socket may have closed before or during loading (e.g. while
        // hi was looking up tokens). destroy() already ran, so nothing else
        // will clean this participant up; don't leave it behind.
        if (this.isDestroyed()) {
            part.removeSocket(this);
            return part;
        }

        this.resetRateLimits();
        return part;
    }

    /**
     * Move this socket to a channel
     * @param _id Target channel ID
     * @param set Channel settings, if the channel is instantiated
     * @param force Whether to skip ban and limit checks
     **/
    public async setChannel(
        _id: string,
        set?: Partial<IChannelSettings>,
        force = false
    ): Promise<void> {
        if (this.isDestroyed()) return;

        let part = await this.assignParticipant();
        if (this.isDestroyed()) return;

        let desiredID = _id;

        // Are we joining the lobby backdoor?
        if (desiredID === channelConfig.lobbyBackdoor) {
            desiredID = "lobby";
            force = true;
        }

        if (part.channel?.getID() === desiredID) return;

        let ch = ChannelList.getChannel(desiredID);
        const isNew = !ch;
        if (!ch) ch = new Channel(desiredID, set);

        if (!force) {
            // Is user banned?
            if (ch.isBanned(part.user._id)) {
                const banTime = ch.getBanTime(part.user._id);

                if (banTime) {
                    const minutes = Math.floor(
                        (banTime.endTime - banTime.startTime) / 1000 / 60
                    );

                    this.sendNotification({
                        class: "short",
                        duration: 7000,
                        target: "#room",
                        text: `Currently banned from "${ch.getID()}" for ${minutes} minutes.`
                    });
                }

                if (desiredID !== channelConfig.fullChannel)
                    return this.setChannel(channelConfig.fullChannel);
                return;
            }

            // Is this channel full? (other tabs of ours don't take up a spot)
            if (!ch.hasUser(part.user._id) && ch.isFull()) {
                // Full lobbies overflow into the next one
                if (ch.isTrueLobby()) {
                    return this.setChannel(ch.getNextLobbyID());
                }

                if (!ch.canBypassLimit(part)) {
                    this.sendNotification({
                        class: "short",
                        duration: 7000,
                        target: "#room",
                        text: `"${ch.getID()}" is full.`
                    });

                    if (desiredID !== channelConfig.fullChannel)
                        return this.setChannel(channelConfig.fullChannel);
                    return;
                }
            }
        }

        const existing = ch.getParticipantByUserID(part.user._id);

        if (existing) {
            // Another tab of ours is already here, share its participant
            if (existing !== part) {
                part.removeSocket(this);
                existing.addSocket(this);
            }

            ch.sendJoinInfo(existing, this);
        } else {
            if (part.sockets.size > 1) {
                // Leave our other tabs behind in the old channel
                part.removeSocket(this);
                part = new Participant(this, part.user);
            } else if (part.channel) {
                part.channel.removeParticipant(part);
            }

            ch.addParticipant(part);
        }

        // Whoever creates a channel gets the crown
        if (isNew && ch.crown && this.participant)
            ch.giveCrown(this.participant.simple());

        // Gateway stuff
        this.gateway.hasJoinedAnyChannel = true;
        if (ch.isLobby()) this.gateway.hasJoinedLobby = true;

        this.resetRateLimits();
    }

    /**
     * Send this socket a channel update message
     **/
    public sendChannelUpdate(
        ch: IChannelInfo,
        ppl: SocketEvents["ch"]["ppl"]
    ) {
        if (!this.participant) return;

        this.sendArray([
            {
                m: "ch",
                ch,
                p: this.participant.id,
                ppl
            }
        ]);
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

    private rateLimitTier?: string;

    /**
     * Reset this socket's rate limits to match their flags and channel status
     **/
    public resetRateLimits() {
        const flags = this.getUserFlags();
        const ch = this.getCurrentChannel();

        let tier: string;
        let limits: RateLimitConstructorList;
        let quota: typeof NoteQuota.PARAMS_NORMAL;

        if (flags.admin == 1) {
            tier = "admin";
            limits = adminLimits;
            quota = NoteQuota.PARAMS_OFFLINE;
        } else if (this.isOwner()) {
            tier = "crown";
            limits = crownLimits;
            quota = NoteQuota.PARAMS_RIDICULOUS;
        } else if (ch?.isLobby()) {
            tier = "lobby";
            limits = userLimits;
            quota = NoteQuota.PARAMS_LOBBY;
        } else {
            tier = "normal";
            limits = userLimits;
            quota = NoteQuota.PARAMS_NORMAL;
        }

        // Don't reset buckets (or spam nq) if nothing changed
        if (tier === this.rateLimitTier) return;
        this.rateLimitTier = tier;

        this.setRateLimits(limits);
        this.setNoteQuota(quota);
    }

    /**
     * Set this socket's note quota
     * @param params Note quota params object
     **/
    public setNoteQuota(params = NoteQuota.PARAMS_NORMAL) {
        this.noteQuota.setParams(params);

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

    private isSubscribedToChannelList = false;

    /**
     * Start sending this socket the list of channels periodically
     **/
    public subscribeToChannelList() {
        if (this.isSubscribedToChannelList) return;

        ChannelList.subscribe(this);

        const _id = this.getUserID();
        this.sendChannelList(
            ChannelList.getPublicList().map(ch => ch.getInfo(_id))
        );

        this.isSubscribedToChannelList = true;
    }

    /**
     * Stop sending this socket the list of channels periodically
     **/
    public unsubscribeFromChannelList() {
        if (!this.isSubscribedToChannelList) return;
        ChannelList.unsubscribe(this);
        this.isSubscribedToChannelList = false;
    }

    /**
     * Send a channel list to this socket
     * @param list List of channels to send
     * @param complete Whether this list is the complete list of channels or just a partial list
     **/
    public sendChannelList(list: IChannelInfo[], complete = true) {
        this.sendArray([
            {
                m: "ls",
                c: complete,
                u: list
            }
        ]);
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
     * Send this socket a notification message
     * @param notif Notification data to send
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

    public sendDisconnectNotification(reason?: string) {
        this.sendNotification({
            title: "Notice",
            text: `You have been disconnected from the server.${
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
        const _id = this.getUserID();
        if (!_id) return false;

        const permissions = await getUserPermissions(_id);

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
        this.isSubscribedToCustom = true;
    }

    /**
     * Disallow custom messages to be sent and received from this socket
     **/
    public unsubscribeFromCustom() {
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

export default Socket;

// biome-ignore lint/suspicious/noExplicitAny: global access for readline shell
(globalThis as any).Socket = Socket;
