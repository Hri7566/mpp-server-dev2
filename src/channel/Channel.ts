import EventEmitter from "events";
import { Logger } from "~/util/Logger";
import type {
    IChannelSettings,
    OutgoingSocketEvents,
    IncomingSocketEvents,
    IParticipant,
    IChannelInfo,
    Notification,
    UserFlags,
    Tag,
    TChannelFlags
} from "~/util/types";
import type { Socket } from "~/ws/Socket";
import { validateChannelSettings } from "./settings";
import { findSocketByPartID, socketsByUUID } from "~/ws/Socket";
import Crown from "./Crown";
import { ChannelList } from "./ChannelList";
import { config } from "./config";
import { config as usersConfig } from "~/ws/usersConfig";
import {
    saveChatHistory,
    getChatHistory,
    deleteChatHistory
} from "~/data/history";
import { mixin, darken, spoop_text, hsl2hex } from "~/util/helpers";
import type { User } from "@prisma/client";
import { heapStats } from "bun:jsc";
import {
    deleteSavedChannel,
    getSavedChannel,
    saveChannel
} from "../data/channel";
import { forceloadChannel } from "./forceload";
import { getRolePermissions } from "~/data/permissions";
import { getRoles } from "~/data/role";

interface CachedKickban {
    userId: string;
    startTime: number;
    endTime: number;
}

interface CachedCursor {
    x: string | number;
    y: string | number;
    id: string;
}

interface ExtraPartData {
    uuids: string[];
    flags: UserFlags;
}

type ExtraPart = IParticipant & ExtraPartData;

/**
 * A channel that can hold users.
 *
 * Any channel can have a crown, a list of banned users, chat history, and has flags.
 */
export class Channel extends EventEmitter {
    private settings: Partial<IChannelSettings>;
    private ppl = new Array<ExtraPart>();

    public chatHistory = new Array<OutgoingSocketEvents["a"]>();

    private async loadChatHistory() {
        try {
            this.chatHistory = await getChatHistory(this.getID());

            this.sendArray([
                {
                    m: "c",
                    c: this.chatHistory
                }
            ]);
        } catch (err) {}
    }

    private async deleteChatHistory() {
        try {
            await deleteChatHistory(this.getID());
        } catch (err) {}
    }

    private async deleteData() {
        try {
            await deleteSavedChannel(this.getID());
        } catch (err) {}
    }

    private async save() {
        //this.logger.debug("Saving channel data");
        try {
            const info = this.getInfo();

            const data = {
                id: info._id,
                settings: JSON.stringify(info.settings),
                flags: JSON.stringify(this.flags),
                forceload: this.stays
            };

            //this.logger.debug("Channel data to save:", data);

            await saveChannel(this.getID(), data);
        } catch (err) {
            this.logger.warn("Error saving channel data:", err);
        }
    }

    private async load() {
        //this.logger.debug("Loading saved data");
        try {
            const data = await getSavedChannel(this.getID());
            if (data) {
                try {
                    this.changeSettings(JSON.parse(data.settings));
                    this.setFlags(JSON.parse(data.flags));
                    this.loadChatHistory();

                    if (data.forceload) {
                        forceloadChannel(this.getID());
                    }

                    //this.logger.debug("Loaded channel data:", data);

                    this.emit("update", this);
                } catch (err) {
                    this.logger.error("Error loading channel data:", err);
                }
            }
        } catch (err) {}
    }

    public logger: Logger;
    public bans = new Array<CachedKickban>();
    public cursorCache = new Array<CachedCursor>();

    public crown?: Crown;

    private flags: TChannelFlags = {};

    constructor(
        private _id: string,
        set?: Partial<IChannelSettings>,
        creator?: Socket,
        owner_id?: string,
        public stays = false
    ) {
        super();

        this.logger = new Logger(`Channel - ${_id}`, "logs/channel");
        this.settings = {};

        // Copy default settings
        mixin(this.settings, config.defaultSettings);

        if (owner_id) this.setFlag("owner_id", owner_id);

        if (!this.isLobby()) {
            if (set) {
                // Copied from changeSettings below
                if (
                    typeof set.color === "string" &&
                    (typeof set.color2 === "undefined" ||
                        set.color2 === this.settings.color2)
                ) {
                    //this.logger.debug("color 2 darken triggered");
                    set.color2 = darken(set.color);
                }

                // Validate settings in set
                const validatedSet = validateChannelSettings(set);

                // Set the verified settings
                for (const key of Object.keys(validatedSet)) {
                    //this.logger.debug(`${key}: ${(validatedSet as any)[key]}`);
                    if (validatedSet[key] === false) continue;
                    this.settings[key] = set[key];
                }
            }

            if (!config.disableCrown) {
                // We are not a lobby, so we probably have a crown
                // this.getFlag("no_crown");
                this.crown = new Crown();

                // ...and, possibly, an owner, too
                if (creator) {
                    const part = creator.getParticipant();
                    if (part) this.giveCrown(part, true, false);
                }
            }
        } else {
            this.settings = config.lobbySettings;
        }

        this.bindEventListeners();

        ChannelList.add(this);
        if (this.flags.owner_id) {
            this.settings.owner_id = this.flags.owner_id;
        }

        this.logger.info("Created");

        if (this.getID() === "test/mem") {
            setInterval(() => {
                this.printMemoryInChat();
            }, 1000);
        }

        if (this.getID() === "rainbowfest") {
            this.setFlag("rainbow", true);
        }
    }

    private alreadyBound = false;
    private destroyTimeout: Timer | undefined;

    private bindEventListeners() {
        if (this.alreadyBound) return;
        this.alreadyBound = true;
        this.load();
        this.save();
        this.logger.info("Loaded chat history");

        this.on("update", (self, uuid) => {
            // Propogate channel flags intended to be updated
            this.emit("update_flags", self, uuid);

            // this.logger.debug("update");
            // Send updated info
            for (const socket of socketsByUUID.values()) {
                for (const p of this.ppl) {
                    const socketUUID = socket.getUUID();

                    if (p.uuids.includes(socketUUID) && socketUUID !== uuid) {
                        socket.sendChannelUpdate(
                            this.getInfo(),
                            this.getParticipantList()
                        );

                        // Set their rate limits to match channel status
                        socket.resetRateLimits();
                    }
                }
            }

            // this.logger.debug("ppl length:", this.ppl.length);
            // this.logger.debug("stays:", this.stays);

            if (this.ppl.length === 0 && !this.stays) {
                if (config.channelDestroyTimeout > 0) {
                    this.destroyTimeout = setTimeout(() => {
                        this.destroy();
                    }, config.channelDestroyTimeout);
                } else {
                    this.destroy();
                }
            }

            if (
                this.ppl.length > 0 &&
                typeof this.destroyTimeout !== "undefined"
            ) {
                clearTimeout(this.destroyTimeout);
            }
        });

        this.on("update_flags", (self, uuid) => {
            if (typeof this.flags.owner_id === "string") {
                this.settings.owner_id = this.flags.owner_id;
            } else {
                delete this.settings.owner_id;
            }

            if (this.flags.rainbow) {
                this.startRainbow();
            } else {
                this.stopRainbow();
            }

            if (this.flags.limit && config.sendLimit) {
                this.settings.limit = this.flags.limit;
            } else {
                delete this.settings.limit;
            }

            if (this.flags.no_crown) {
                delete this.crown;
            }
        });

        const BANNED_WORDS = ["AMIGHTYWIND", "CHECKLYHQ"];

        this.on("a", async (msg: IncomingSocketEvents["a"], socket: Socket) => {
            try {
                if (typeof msg.message !== "string") return;

                const userFlags = socket.getUserFlags();
                let overrideColor: string | undefined;

                if (userFlags) {
                    if (userFlags.cant_chat === 1) return;
                    if (userFlags.chat_curse_1 === 1)
                        msg.message = msg.message
                            .replace(/[aeiu]/g, "o")
                            .replace(/[AEIU]/g, "O");
                    if (userFlags.chat_curse_2 === 1)
                        msg.message = spoop_text(msg.message);
                    if (typeof userFlags.chat_color === "string")
                        overrideColor = userFlags.chat_color;
                }

                if (!this.settings.chat) return;

                if (msg.message.length > 512) return;

                for (const word of BANNED_WORDS) {
                    if (
                        msg.message
                            .toLowerCase()
                            .split(" ")
                            .join("")
                            .includes(word.toLowerCase())
                    ) {
                        return;
                    }
                }

                // Sanitize chat message
                // Regex originally written by chacha for Brandon's server
                // Used with permission
                msg.message = msg.message
                    .replace(/\p{C}+/gu, "")
                    .replace(/(\p{Mc}{5})\p{Mc}+/gu, "$1")
                    .trim();

                const part = socket.getParticipant() as IParticipant;

                const outgoing: OutgoingSocketEvents["a"] = {
                    m: "a",
                    a: msg.message,
                    t: Date.now(),
                    p: part
                };

                if (typeof overrideColor !== "undefined")
                    outgoing.p.color = overrideColor;

                this.sendArray([outgoing]);
                this.chatHistory.push(outgoing);
                await saveChatHistory(this.getID(), this.chatHistory);

                this.logger.info(`${part._id} ${part.name}: ${outgoing.a}`);

                if (msg.message.startsWith("/")) {
                    this.emit("command", msg, socket);
                }
            } catch (err) {
                this.logger.error(err);
                this.logger.warn(
                    `Error whilst processing a chat message from user ${socket.getUserID()}`
                );
            }
        });

        this.on("command", async (msg, socket: Socket) => {
            if (!config.enableChatCommands) return;

            const args = msg.message.split(" ");
            const cmd = args[0].substring(1);
            const userID = socket.getUserID();
            const ownsChannel =
                this.hasUser(userID) &&
                this.crown &&
                this.crown.userId == userID;
            const roles = await getRoles(userID);

            if (cmd === "mem") {
                this.printMemoryInChat();
            } else if (cmd === "roles") {
                this.logger.debug(roles);
                this.sendChatAdmin(
                    `Roles: ${roles.map(r => r.roleId).join(", ")}`
                );
            }
        });

        this.on("user data update", (user: User) => {
            try {
                if (!this.ppl.map(p => p._id).includes(user.id)) return;
                if (typeof user.name !== "string") return;
                if (typeof user.color !== "string") return;
                if (typeof user.id !== "string") return;
                if (
                    typeof user.tag !== "undefined" &&
                    typeof user.tag !== "string"
                )
                    return;
                if (
                    typeof user.flags !== "undefined" &&
                    typeof user.flags !== "string"
                )
                    return;

                let tag: Tag | undefined;
                let flags: UserFlags | undefined;

                try {
                    tag = JSON.parse(user.tag);
                } catch (err) {}

                try {
                    flags = JSON.parse(user.flags) as UserFlags;
                } catch (err) {}

                for (const p of this.ppl) {
                    if (p._id !== user.id) continue;

                    p._id = user.id;
                    p.name = user.name;
                    p.color = user.color;
                    p.tag = tag;
                    if (flags) p.flags = flags;

                    let found:
                        | { x: string | number; y: string | number; id: string }
                        | undefined;

                    for (const cursor of this.cursorCache) {
                        if (cursor.id === p.id) {
                            found = cursor;
                        }
                    }

                    let x: string | number = "0.00";
                    let y: string | number = "-10.00";

                    if (found) {
                        x = found.x;
                        y = found.y;
                    }

                    this.sendArray([
                        {
                            m: "p",
                            _id: p._id,
                            name: p.name,
                            color: p.color,
                            id: p.id,
                            x: x,
                            y: y,
                            tag: usersConfig.enableTags ? p.tag : undefined
                        }
                    ]);
                }

                //this.logger.debug("Update from user data update handler");
                this.emit("update", this);
            } catch (err) {
                this.logger.error(err);
                this.logger.warn("Unable to update user");
            }
        });

        this.on("cursor", (pos: CachedCursor) => {
            let found: CachedCursor | undefined;

            for (const cursor of this.cursorCache) {
                if (cursor.id === pos.id) {
                    found = cursor;
                }
            }

            if (!found) {
                // Cache the cursor pos
                this.cursorCache.push(pos);
            } else {
                // Edit the cache
                found.x = pos.x;
                found.y = pos.y;
            }

            this.sendArray([
                {
                    m: "m",
                    id: pos.id,
                    x: pos.x,
                    y: pos.y
                }
            ]);
        });

        this.on("set owner id", id => {
            this.setFlag("owner_id", id);
        });
    }

    /**
     * Get this channel's ID (channel name)
     * @returns Channel ID
     */
    public getID() {
        return this._id;
    }

    /**
     * Set this channel's ID (channel name)
     **/
    public setID(_id: string) {
        // probably causes jank, but people can just reload their page or whatever
        // not sure what to do about the URL situation
        this._id = _id;
        //this.logger.debug("Update from setID");
        this.emit("update", this);
    }

    /**
     * Determine whether this channel is a lobby (uses regex from config)
     * @returns Boolean
     */
    public isLobby() {
        for (const reg of config.lobbyRegexes) {
            const exp = new RegExp(reg, "g");

            if (this.getID().match(exp)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine whether this channel is a lobby with the name "lobby" in it
     */
    public isTrueLobby() {
        const _id = this.getID();
        return (
            _id.match("^lobby[0-9][0-9]$") &&
            _id.match("^lobby[0-9]$") &&
            _id.match("^lobby$") &&
            _id.match("^lobbyNaN$")
        );
    }

    /**
     * Change this channel's settings
     * @param set Channel settings
     * @param admin Whether a user is changing the settings (set to true to force the changes)
     * @returns undefined
     */
    public changeSettings(set: Partial<IChannelSettings>, admin = false) {
        if (this.isDestroyed()) return;
        if (!admin) {
            if (set.lobby) set.lobby = undefined;
            if (set.owner_id) set.owner_id = undefined;
        }

        if (
            typeof set.color === "string" &&
            (typeof set.color2 === "undefined" ||
                set.color2 === this.settings.color2)
        ) {
            set.color2 = darken(set.color);
        }

        if (this.isLobby() && !admin) return;

        // Validate settings in set
        const validatedSet = validateChannelSettings(set);

        // Set the verified settings
        for (const key of Object.keys(validatedSet)) {
            //this.logger.debug(`${key}: ${(validatedSet as any)[key]}`);
            if (validatedSet[key] === false) continue;
            this.settings[key] = set[key];
        }

        /*
        // Verify settings
        const validSettings = validateChannelSettings(set);

        for (const key of Object.keys(validSettings)) {
            // Setting is valid?
            if ((validSettings as Record<string, boolean>)[key]) {
                // Change setting
                (this.settings as Record<string, ChannelSettingValue>)[key] = (
                    set as Record<string, ChannelSettingValue>
                )[key];
            }
        }
        */

        //this.logger.debug("Update from changeSettings");
        (async () => {
            await this.save();
        })();
        this.emit("update", this);
    }

    /**
     * Get a channel setting's value
     * @param setting Channel setting to get
     * @returns Value of setting
     */
    public getSetting(setting: keyof IChannelSettings) {
        return this.settings[setting];
    }

    /**
     * Get this channel's settings
     * @returns This channel's settings
     */
    public getSettings() {
        return this.settings;
    }

    /**
     * Make a socket join this channel
     * @param socket Socket that is joining
     * @returns undefined
     */
    public join(socket: Socket, force = false): void {
        if (this.isDestroyed()) return;
        const part = socket.getParticipant() as IParticipant;

        let hasChangedChannel = false;

        //this.logger.debug("Join force:", force);

        if (!force) {
            // Is user banned?
            if (this.isBanned(part._id)) {
                // Send user to ban channel instead
                const chs = ChannelList.getList();

                for (const ch of chs) {
                    const chid = ch.getID();

                    if (chid === config.fullChannel) {
                        const banTime = this.getBanTime(socket.getUserID());

                        //this.logger.debug("Ban time:", banTime);

                        if (banTime) {
                            const minutes = Math.floor(
                                (banTime.endTime - banTime.startTime) /
                                    1000 /
                                    60
                            );

                            socket.sendNotification({
                                class: "short",
                                duration: 7000,
                                target: "#room",
                                text: `Currently banned from "${this.getID()}" for ${minutes} minutes.`
                            });
                        }

                        socket.setChannel(chid);
                        return;
                    }
                }
            }

            // Is this channel full?
            if (this.isFull()) {
                // Is this a genuine lobby (not a test/ room or something)?
                if (this.isTrueLobby()) {
                    // Get the next lobby number
                    const nextID = this.getNextLobbyID();
                    //this.logger.debug("New ID:", nextID);
                    // Move them to the next lobby
                    socket.setChannel(nextID);
                    return;
                }
            }
        }

        // Is the user in this channel?
        if (this.hasUser(part._id)) {
            // They are already here, don't add them to the part list again, instead just tell them they're here
            hasChangedChannel = true;

            for (const p of this.ppl) {
                if (p.id !== part.id) continue;
                p.uuids.push(socket.getUUID());
            }

            //socket.sendChannelUpdate(this.getInfo(), this.getParticipantList());
        } else {
            // Add them to the channel
            hasChangedChannel = true;
            this.ppl.push({
                _id: part._id,
                name: part.name,
                color: part.color,
                id: part.id,
                uuids: [socket.getUUID()],
                flags: socket.getUserFlags() || {},
                tag: part.tag
            });
        }

        // Was the move complete?
        if (hasChangedChannel) {
            // Were they in a channel before?
            if (socket.currentChannelID) {
                // Find the other channel they were in
                const ch = ChannelList.getList().find(
                    ch => ch._id === socket.currentChannelID
                );

                // Tell the channel they left
                if (ch) ch.leave(socket);
            }

            // You belong here now
            socket.currentChannelID = this.getID();

            // Did they have the crown before?
            // If so, give it back
            //? Apparently, this feature is slightly broken on
            //? the original MPP right now. When the user rejoins,
            //? they will have the crown, but any other users
            //? won't see that the crown has been given to the
            //? original owner. This is strange, because I
            //? specifically remember it working circa 2019-2020.
            if (this.crown && config.chownOnRejoin) {
                //? Should we check participant ID as well?
                if (typeof this.crown.userId !== "undefined") {
                    if (socket.getUserID() === this.crown.userId) {
                        // Check if they exist
                        const p = socket.getParticipant();

                        if (p) {
                            // Give the crown back
                            this.giveCrown(p, true, true);
                        }
                    }
                }
            }
        }

        socket.sendArray([
            // {
            //     m: "ch",
            //     ch: this.getInfo(),
            //     p: part.id,
            //     ppl: this.getParticipantList()
            // },
            {
                m: "c",
                c: this.chatHistory.slice(-50)
            }
        ]);

        // Get our friend's cursor position
        const cursorPos: {
            x: string | number | undefined;
            y: string | number | undefined;
        } = socket.getCursorPos();

        // Broadcast a participant update for them
        this.sendArray(
            [
                {
                    m: "p",
                    _id: part._id,
                    name: part.name,
                    color: part.color,
                    id: part.id,
                    x: cursorPos.x,
                    y: cursorPos.y,
                    tag: usersConfig.enableTags ? part.tag : undefined
                }
            ],
            part.id
        );

        // Broadcast a channel update so everyone subscribed to the channel list can see the new user count
        //this.emit("update", this, socket.getUUID());
        //this.logger.debug("Update from join");
        // this.emit("update", this);
        socket.sendChannelUpdate(this.getInfo(), this.getParticipantList());

        //this.logger.debug("Settings:", this.settings);
        if (this.settings.owner_id === part._id) {
            this.giveCrown(part, true, true);
        }
    }

    /**
     * Make a socket leave this channel
     * @param socket Socket that is leaving
     */
    public leave(socket: Socket) {
        // this.logger.debug("Leave called");
        const part = socket.getParticipant();
        if (!part) return;

        let dupeCount = 0;
        for (const s of socketsByUUID.values()) {
            if (s.getParticipantID() === part.id) {
                if (s.currentChannelID === this.getID()) {
                    dupeCount++;
                }
            }
        }

        // this.logger.debug("Dupes:", dupeCount);

        if (dupeCount === 1) {
            const p = this.ppl.find(p => p.id === socket.getParticipantID());

            let hadCrown = false;

            if (p) {
                this.ppl.splice(this.ppl.indexOf(p), 1);

                if (this.crown) {
                    if (this.crown.participantId === p.id) {
                        // Channel owner left, reset crown timeout
                        hadCrown = true;
                        this.chown();
                    }
                }
            }

            // Broadcast bye (chown already sent update, so no need to update again)
            if (!hadCrown)
                this.sendArray([
                    {
                        m: "bye",
                        p: part.id
                    }
                ]);

            //this.logger.debug("Update from leave");
            if (this.ppl.length < 2) this.emit("update", this);
        } else {
            for (const p of this.ppl) {
                if (!p.uuids.includes(socket.getUUID())) continue;
                p.uuids.splice(p.uuids.indexOf(socket.getUUID()), 1);
            }
        }
    }

    /**
     * Determine whether this channel has too many users
     * @returns Boolean
     */
    public isFull() {
        if (this.isTrueLobby() && this.ppl.length >= 20) {
            return true;
        }

        // Check user-defined participant limit
        if (
            typeof this.settings.limit === "number" &&
            this.ppl.length >= this.settings.limit
        ) {
            return true;
        }

        return false;
    }

    /**
     * Get this channel's information
     * @returns Channel info object (includes ID, number of users, settings, and the crown)
     */
    public getInfo(_id?: string) {
        return {
            _id: this.getID(),
            id: this.getID(),
            banned: _id ? this.isBanned(_id) : false,
            count: this.ppl.length,
            settings: this.settings,
            crown: this.crown
                ? JSON.parse(JSON.stringify(this.crown))
                : undefined
        } as IChannelInfo;
    }

    /**
     * Get the people in this channel
     * @param showVanished Whether to include vanished users
     * @returns List of people
     */
    public getParticipantList(showVanished = false) {
        const ppl = [];

        for (const p of this.ppl) {
            if (p.flags.vanish && !showVanished) continue;

            ppl.push({
                _id: p._id,
                name: p.name,
                color: p.color,
                id: p.id,
                tag: usersConfig.enableTags ? p.tag : undefined,
                vanished: p.flags.vanish
            });
        }

        return ppl;
    }

    public getParticipantListUnsanitized() {
        return this.ppl;
    }

    /**
     * Determine whether a user is in this channel (by user ID)
     * @param _id User ID
     * @returns Boolean
     */
    public hasUser(_id: string) {
        const foundPart = this.ppl.find(p => p._id === _id);
        return !!foundPart;
    }

    /**
     * Determine whether a user is in this channel (by participant ID)
     * @param id Participant ID
     * @returns Boolean
     */
    public hasParticipant(id: string) {
        const foundPart = this.ppl.find(p => p.id === id);
        return !!foundPart;
    }

    /**
     * Send messages to everyone in this channel
     * @param arr List of events to send to clients
     */
    public sendArray<EventID extends keyof OutgoingSocketEvents>(
        arr: OutgoingSocketEvents[EventID][],
        blockPartID?: string
    ) {
        const sentSocketIDs = new Array<string>();

        for (const p of this.ppl) {
            if (blockPartID) {
                if (p.id === blockPartID) continue;
            }

            for (const socket of socketsByUUID.values()) {
                if (socket.isDestroyed()) continue;
                if (!socket.socketID) continue;
                if (socket.getParticipantID() !== p.id) continue;
                if (sentSocketIDs.includes(socket.socketID)) continue;
                socket.sendArray(arr);
                sentSocketIDs.push(socket.socketID);
            }
        }
    }

    /**
     * Play notes (usually from a socket)
     * @param msg Note message
     * @param socket Socket that is sending notes
     * @returns undefined
     */
    public playNotes(msg: IncomingSocketEvents["n"], socket?: Socket) {
        if (this.isDestroyed()) return;
        let pianoPartID = usersConfig.adminParticipant.id;

        if (socket) {
            const part = socket.getParticipant();
            if (!part) return;
            pianoPartID = part.id;

            const flags = socket.getUserFlags();

            if (flags) {
                // Is crownsolo on?
                if (
                    this.settings.crownsolo &&
                    this.crown &&
                    !(flags.admin || flags.mod)
                ) {
                    // Do they have the crown?
                    if (part.id !== this.crown.participantId) return;
                }
            }

            if (this.flags.player_colors) {
                if (this.getSetting("color") !== part.color) {
                    this.changeSettings(
                        {
                            color: part.color
                        },
                        true
                    );
                }
            }
        }

        const clientMsg: OutgoingSocketEvents["n"] = {
            m: "n",
            n: msg.n,
            t: msg.t,
            p: pianoPartID
        };

        const sentSocketIDs = new Array<string>();

        for (const p of this.ppl) {
            for (const sock of socketsByUUID.values()) {
                if (sock.isDestroyed()) continue;
                if (!sock.socketID) continue;

                if (socket) {
                    if (sock.getUUID() === socket.getUUID()) continue;
                }

                if (sock.getParticipantID() !== p.id) continue;
                //if (socket.getParticipantID() == part.id) continue socketLoop;
                if (sentSocketIDs.includes(sock.socketID)) continue;

                sock.sendArray([clientMsg]);
                sentSocketIDs.push(sock.socketID);
            }
        }
    }

    private destroyed = false;

    /**
     * Set this channel to the destroyed state
     * @returns undefined
     */
    public destroy() {
        if (this.destroyed) return;

        this.destroyed = true;

        if (this.ppl.length > 0) {
            for (const socket of socketsByUUID.values()) {
                if (socket.currentChannelID !== this.getID()) continue;
                socket.setChannel(config.fullChannel);
            }
        }

        ChannelList.remove(this);
        this.deleteChatHistory();
        this.deleteData();
        this.logger.info("Destroyed");
    }

    /**
     * Determine whether the channel is in a destroyed state
     * @returns Boolean
     */
    public isDestroyed() {
        return this.destroyed === true;
    }

    /**
     * Change ownership (don't forget to use crown.canBeSetBy if you're letting a user call this)
     * @param part Participant to give crown to (or undefined to drop crown)
     */
    public chown(part?: IParticipant, admin = false) {
        // this.logger.debug("chown called");
        if (part) {
            this.giveCrown(part, admin);
        } else {
            this.dropCrown();
        }
    }

    /**
     * Give the crown to a user (no matter what)
     * @param part Participant to give crown to
     * @param force Whether or not to force-create a crown (useful for lobbies)
     */
    public giveCrown(part: IParticipant, force = false, update = true) {
        if (force) {
            if (!this.crown) this.crown = new Crown();
        }

        if (this.crown) {
            this.crown.userId = part._id;
            this.crown.participantId = part.id;
            this.crown.time = Date.now();

            if (update) {
                // this.logger.debug("Update from giveCrown");
                this.emit("update", this);
            }
        }
    }

    /**
     * Drop the crown (reset timer, and, if applicable, remove from user's head)
     */
    public dropCrown() {
        if (!this.crown) return;

        this.crown.time = Date.now();

        let socket: Socket | undefined;
        if (this.crown.participantId)
            socket = findSocketByPartID(this.crown.participantId);

        const x = Math.random() * 100;
        const y1 = Math.random() * 100;
        const y2 = y1 + Math.random() * (100 - y1);

        if (socket) {
            const cursorPos = socket.getCursorPos();

            let cursorX = cursorPos.x;
            if (typeof cursorPos.x === "string")
                cursorX = Number.parseInt(cursorPos.x);

            let cursorY = cursorPos.y;
            if (typeof cursorPos.y === "string")
                cursorY = Number.parseInt(cursorPos.y);
        }

        // Screen positions
        this.crown.startPos = { x, y: y1 };
        this.crown.endPos = { x, y: y2 };

        this.crown.participantId = undefined;

        //this.logger.debug("Update from dropCrown");
        this.emit("update", this);
    }

    /**
     * Kickban a participant for t milliseconds.
     * @param _id User ID to ban
     * @param t Time in millseconds to ban for
     **/
    public async kickban(
        _id: string,
        t: number = 1000 * 60 * 30,
        banner?: string
    ) {
        const now = Date.now();
        if (t < 0 || t > config.maxBanMinutes * 60 * 1000) return;

        let shouldUpdate = false;

        const banChannel = ChannelList.getList().find(
            ch => ch.getID() === config.fullChannel
        );

        if (!banChannel) return;

        // Check if they are on the server at all
        let bannedPart: IParticipant | undefined;
        const bannedUUIDs: string[] = [];
        for (const sock of socketsByUUID.values()) {
            if (sock.getUserID() === _id) {
                bannedUUIDs.push(sock.getUUID());
                const part = sock.getParticipant();

                if (part) bannedPart = part;
            }
        }

        if (!bannedPart) return;

        const isBanned = this.bans.map(b => b.userId).includes(_id);
        let overwrite = false;

        if (isBanned) {
            overwrite = true;
        }

        let uuidsToKick: string[] = [];

        if (!overwrite) {
            this.bans.push({
                userId: _id,
                startTime: now,
                endTime: now + t
            });

            shouldUpdate = true;
        } else {
            for (const ban of this.bans) {
                if (ban.userId !== _id) continue;
                ban.startTime = now;
                ban.endTime = now + t;
            }

            shouldUpdate = true;
        }

        uuidsToKick = [...uuidsToKick, ...bannedUUIDs];

        for (const socket of socketsByUUID.values()) {
            if (uuidsToKick.indexOf(socket.getUUID()) !== -1) {
                socket.sendNotification({
                    title: "Notice",
                    text: `Banned from "${this.getID()}" for ${Math.floor(
                        t / 1000 / 60
                    )} minutes.`,
                    duration: 7000,
                    target: "#room",
                    class: "short"
                });

                // If they are here, move them to the ban channel
                const ch = socket.getCurrentChannel();
                if (ch) {
                    if (ch.getID() === this.getID())
                        socket.setChannel(banChannel.getID());
                }
            }
        }

        if (shouldUpdate) {
            //this.logger.debug("Update from kickban");
            this.emit("update", this);

            if (typeof banner !== "undefined") {
                const p = this.getParticipantListUnsanitized().find(
                    p => p._id === banner
                );
                const minutes = Math.floor(t / 1000 / 60);

                if (p && bannedPart) {
                    await this.sendChat(
                        {
                            m: "a",
                            message: `Banned ${bannedPart.name} from the channel for ${minutes} minutes.`
                        },
                        p
                    );
                    this.sendNotification({
                        title: "Notice",
                        text: `${p.name} banned ${bannedPart.name} from the channel for ${minutes} minutes.`,
                        duration: 7000,
                        target: "#room",
                        class: "short"
                    });

                    if (banner === _id) {
                        const certificate = {
                            title: "Certificate of Award",
                            text: `Let it be known that ${p.name} kickbanned him/her self.`,
                            duration: 7000,
                            target: "#room"
                        };

                        this.sendNotification(certificate);

                        for (const s of socketsByUUID.values()) {
                            const userID = s.getUserID();
                            if (!userID) continue;
                            if (userID !== banner) continue;
                            s.sendNotification(certificate);
                        }
                    }
                }
            }
        }
    }

    /**
     * Check if a user is banned here right now
     * @param _id User ID
     * @returns True if the user is banned, otherwise false
     **/
    public isBanned(_id: string) {
        const now = Date.now();

        for (const ban of this.bans) {
            if (ban.endTime <= now) {
                // Remove old ban and skip
                this.bans.splice(this.bans.indexOf(ban), 1);
                continue;
            }

            // Check if they are banned
            if (ban.userId === _id) {
                return true;
            }
        }

        return false;
    }

    /**
     * Unban a user who was kickbanned from this channel
     * @param _id User ID of banned user
     **/
    public unban(_id: string) {
        const isBanned = this.isBanned(_id);

        if (!isBanned) return;

        for (const ban of this.bans) {
            if (ban.userId === _id) {
                this.bans.splice(this.bans.indexOf(ban), 1);
            }
        }
    }

    /**
     * Clear the chat and chat history
     **/
    public async clearChat() {
        this.chatHistory = [];
        await saveChatHistory(this.getID(), this.chatHistory);

        this.sendArray([
            {
                m: "c",
                c: this.chatHistory
            }
        ]);
    }

    /**
     * Send a notification to this channel
     * @param notif Notification to send
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

    /**
     * Send a message in chat
     * @param msg Chat message event to send
     * @param p Participant who is "sending the message"
     **/
    public async sendChat(msg: IncomingSocketEvents["a"], p: IParticipant) {
        if (!msg.message) return;

        if (msg.message.length > 512) return;

        // Sanitize
        msg.message = msg.message
            .replace(/\p{C}+/gu, "")
            .replace(/(\p{Mc}{5})\p{Mc}+/gu, "$1")
            .trim();

        const outgoing: OutgoingSocketEvents["a"] = {
            m: "a",
            a: msg.message,
            t: Date.now(),
            p: p
        };

        this.sendArray([outgoing]);
        this.chatHistory.push(outgoing);

        // Limit chat history to 512 messages
        if (this.chatHistory.length > 512) {
            this.chatHistory.splice(0, this.chatHistory.length - 512);
        }

        await saveChatHistory(this.getID(), this.chatHistory);
    }

    /**
     * Send a chat message as an admin
     * @param message Message to send in chat
     **/
    public async sendChatAdmin(message: string) {
        this.sendChat(
            {
                m: "a",
                message
            },
            usersConfig.adminParticipant
        );
    }

    /**
     * Set a flag on this channel
     * @param key Flag ID
     * @param val Value of which the flag will be set to
     **/
    public setFlag<K extends keyof TChannelFlags>(
        key: K,
        val: TChannelFlags[K]
    ) {
        this.flags[key] = val;
        // this.logger.debug("Updating channel flag " + key + " to", val);
        this.emit("update", this);
    }

    /**
     * Get a flag on this channel
     * @param key Flag ID
     * @returns Value of flag
     **/
    public getFlag<K extends keyof TChannelFlags>(key: K) {
        return this.flags[key];
    }

    /**
     * Get the flags on this channel
     * @returns This channel's flags
     */
    public getFlags() {
        return this.flags;
    }

    /**
     * Set the flags on this channel
     * @param flags Flags to set
     **/
    public setFlags(flags: TChannelFlags) {
        this.flags = flags;
        this.save();
        this.emit("update", this);
    }

    /**
     * Get the ID of the next lobby, useful if this channel is full and is also a lobby
     * @returns ID of the next lobby in numeric succession
     **/
    public getNextLobbyID() {
        try {
            const id = this.getID();
            if (id === "lobby") return "lobby2";
            const num = Number.parseInt(id.substring(5));
            return `lobby${num + 1}`;
        } catch (err) {
            return config.fullChannel;
        }
    }

    /**
     * Get the amount of time someone is banned in this channel for.
     * @param userId User ID
     * @returns Object containing endTime and startTime of the ban
     **/
    public getBanTime(userId: string) {
        for (const ban of this.bans) {
            if (userId === ban.userId) {
                return { endTime: ban.endTime, startTime: ban.startTime };
            }
        }
    }

    /**
     * Print the amount of memory the server is using in chat
     **/
    public printMemoryInChat() {
        const mem = heapStats();
        this.sendChatAdmin(
            `Used: ${(mem.heapSize / 1000 / 1000).toFixed(2)}M / Allocated: ${(
                mem.heapCapacity /
                1000 /
                1000
            ).toFixed(2)}M`
        );
    }

    public setForceload(enable: boolean) {
        this.stays = enable;
        this.save();
    }

    private startedRainbow = false;
    private rainbowInterval: Timer | undefined;
    private rainbowHue = 0;

    public startRainbow() {
        if (this.startedRainbow) return;
        this.startedRainbow = true;
        this.rainbowInterval = setInterval(() => {
            this.rainbowHue++;
            while (this.rainbowHue > 360) this.rainbowHue -= 360;
            while (this.rainbowHue < 0) this.rainbowHue += 360;
            this.changeSettings({
                color: hsl2hex(this.rainbowHue, 100, 75),
                color2: hsl2hex(this.rainbowHue, 100, 25)
            });
        }, 1000 / 5);
    }

    public stopRainbow() {
        if (!this.startedRainbow) return;
        this.startedRainbow = false;
        clearInterval(this.rainbowInterval);
    }
}

export default Channel;
