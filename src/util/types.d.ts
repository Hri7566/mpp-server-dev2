import type { Socket } from "~/ws/Socket";

declare type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

declare type UserFlags = Partial<{
    // Brandon flags
    freeze_name: number;
    "no chat rate limit": number;
    chat_curse_1: number;
    chat_curse_2: number;
    override_id: string;
    volume: number;
    cant_chat: number;
    cansetcrowns: number;

    // new
    "no note quota": number;
    "no note rate limit": number;
    "no cursor rate limit": number;
    "no userset rate limit": number;
    mod: number;
    admin: number;
    vanish: number;
    chat_color: string;
}>;

type TChannelFlags = Partial<{
    limit: number; // slightly different compared to mppnet
    owner_id: string; // brandonism
    no_crown: boolean;
    rainbow: boolean;
    player_colors: boolean;
}>;

declare interface Tag {
    text: string;
    color: string;
}

declare interface User {
    _id: string; // user id
    name: string;
    color: string;
    tag?: Tag;
}

declare interface IParticipant extends User {
    id: string; // participant id (same as user id on mppclone)
}

declare type IChannelSettings = {
    color: string;
    crownsolo: boolean;
    chat: boolean;
    visible: boolean;
} & Partial<{
    color2: string;
    lobby: boolean;
    owner_id: string;
    "lyrical notes": boolean;
    "no cussing": boolean;

    limit: number;
    noindex: boolean;
}> &
    Record<string, unknown>;

declare type ChannelSettingValue = Partial<string | number | boolean>;

declare type NoteLetter = `a` | `b` | `c` | `d` | `e` | `f` | `g`;
declare type NoteOctave = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

declare interface Note {
    n: `${NoteLetter}${NoteOctave}`;
    d: number;
    v: number;
    s?: 1;
}

declare type Notification = Partial<{
    duration: number;
    class: string;
    id: string;
    title: string;
    text: string;
    html: string;
    target: string;
}>;

declare type CustomTarget = {
    global?: boolean;
} & (
    | {
          mode: "subscribed";
      }
    | {
          mode: "ids";
          ids: string[];
      }
    | {
          mode: "id";
          id: string;
      }
);

declare interface Crown {
    userId: string;
    partcipantId?: string;
    time: number;
    startPos: Vector2;
    endPos: Vector2;
}

declare interface IncomingSocketEvents {
    hi: {
        m: "hi";
        token?: string;
        login?: { type: string; code: string };
        code?: string;
    };

    a: {
        m: "a";
        message: string;
    };

    bye: {
        m: "bye";
    };

    ch: {
        m: "ch";
        _id: string;
        set: IChannelSettings;
    };

    chown: {
        m: "chown";
        id?: string;
    };

    chset: {
        m: "chset";
        set: IChannelSettings;
    };

    custom: {
        m: "custom";
        data: unknown;
        target: CustomTarget;
    };

    devices: {
        m: "devices";
        list: unknown[];
    };

    dm: {
        m: "dm";
        message: string;
        _id: string;
    };

    kickban: {
        m: "kickban";
        _id: string;
        ms: number;
    };

    m: {
        m: "m";
        x?: string | number;
        y?: string | number;
    };

    "-custom": {
        m: "-custom";
    };

    "-ls": {
        m: "-ls";
    };

    n: {
        m: "n";
        t: number;
        n: Note[];
    };

    "+custom": {
        m: "+custom";
    };

    "+ls": {
        m: "+ls";
    };

    t: {
        m: "t";
        e: number;
    };

    unban: {
        m: "unban";
        _id: string;
    };

    userset: {
        m: "userset";
        set: { name?: string; color?: string };
    };

    "admin message": {
        m: "admin message";
        password: string;
        msg: IncomingSocketEvents[keyof IncomingSocketEvents];
    };

    b: {
        m: "b";
        code: string;
    };

    // Admin

    color: {
        // brandonism
        m: "color";
        _id: string;
        color: string;
    };

    name: {
        // brandonism
        m: "name";
        _id: string;
        name: string;
    };

    setcolor: {
        // mppclone
        m: "setcolor";
        _id: string;
        color: string;
    };

    setname: {
        // mppclone
        m: "setname";
        _id: string;
        color: string;
    };

    user_flag: {
        // brandonism
        m: "user_flag";
        _id: string;
        key: keyof UserFlags;
        value?: UserFlags[keyof UserFlags];
        remove?: true;
    };

    tag: {
        m: "tag";
        _id: string;
        tag: {
            text: string;
            color: string;
        };
    };

    clear_chat: {
        m: "clear_chat";
    };

    notification: {
        // brandonism
        m: "notification";
        targetChannel?: string;
        targetUser?: string;
    } & Notification;

    restart: {
        m: "restart";
    };

    forceload: {
        m: "forceload";
        _id: string;
    };

    unforceload: {
        m: "unforceload";
        _id: string;
    };

    ch_flag: {
        m: "ch_flag";
        _id?: string;
        key: string;
        value: unknown;
    } & {
        m: "ch_flag";
        _id?: string;
        key: string;
        remove: boolean;
    };

    move: {
        m: "move";
        ch: string;
        _id?: string;
        set?: Partial<IChannelSettings>;
    };

    rename_channel: {
        m: "rename_channel";
        _id: string;
    };

    admin_chat: {
        m: "admin_chat";
        _id?: string;
        message: string;
    };

    eval: {
        m: "eval";
        str: string;
    };

    remove_tag: {
        m: "remove_tag";
        _id: string;
    };
}

declare interface OutgoingSocketEvents {
    a: {
        m: "a";
        a: string;
        p: Participant;
        t: number;
    };

    b: {
        m: "b";
        code: string;
    };

    c: {
        m: "c";
        c: IncomingMPPEvents["a"][];
    };

    ch: {
        m: "ch";
        p: string;
        ch: IChannelInfo;
        ppl: Participant[];
    };

    custom: {
        m: "custom";
        data: unknown;
        p: string;
    };

    hi: {
        m: "hi";
        t: number;
        u: User;
        permissions: unknown;
        token?: string;
        accountInfo: unknown;
        motd?: string;
    };

    ls: {
        m: "ls";
        c: boolean;
        u: ChannelInfo[];
    };

    m: {
        m: "m";
        x: string | number;
        y: string | number;
        id: string;
    };

    n: {
        m: "n";
        t: number;
        n: Note[];
        p: string;
    };

    notification: {
        m: "notification";
        duration?: number;
        class?: string;
        id?: string;
        title?: string;
        text?: string;
        html?: string;
        target?: string;
    };

    nq: {
        m: "nq";
        allowance: number;
        max: number;
        maxHistLen: number;
    };

    p: {
        m: "p";
        x: number | string | undefined;
        y: number | string | undefined;
    } & Participant;

    t: {
        m: "t";
        t: number;
        e: number | undefined;
    };

    bye: {
        m: "bye";
        p: string;
    };
}

type EventID = IncomingSocketEvents[keyof IncomingSocketEvents]["m"];

declare type ServerEventListener<E extends EventID> = {
    id: E;
    callback: (msg: IncomingSocketEvents[E], socket: Socket) => Promise<void>;
};

declare type Vector2<T = number> = {
    x: T;
    y: T;
};

declare interface ICrown {
    // User who had the crown (remove participantId if there is none, no userId if there hasn't been one)
    userId?: string;
    participantId?: string;

    // Crown position when dropped (beginning and end of slide animation)
    startPos: Vector2;
    endPos: Vector2;

    // Timestamp from the latest crown update
    time: number;
}

declare interface IChannelInfo {
    banned?: boolean;
    _id: string;
    id: string;
    count: number;
    settings: Partial<IChannelSettings>;
    crown?: ICrown;
}

declare interface IRole {
    userId: string;
    roleId: string;
}
