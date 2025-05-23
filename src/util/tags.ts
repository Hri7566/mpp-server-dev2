import { ConfigManager } from "./config";
import { Tag } from "./types";
import { User } from "@prisma/client";
import { readUser, updateUser } from "~/data/user";
import { ChannelList } from "~/channel/ChannelList";
import { bus } from "~/event/bus";

export const builtinTags = ConfigManager.loadConfig<Record<string, Tag>>(
    "config/tags.yml",
    {
        admin: {
            text: "ADMIN",
            color: "#ff5555"
        },
        trialmod: {
            text: "TRIAL MOD",
            color: "#ffbb00"
        },
        mod: {
            text: "MOD",
            color: "#00aa00"
        },
        media: {
            text: "MEDIA",
            color: "#ff55ff"
        },
        dev: {
            text: "DEV",
            color: "#5500ff"
        },
        bot: {
            text: "BOT",
            color: "#5555ff"
        },
        owner: {
            text: "OWNER",
            color: "#aa0000"
        }
    }
);

function propogateUser(user: User) {
    bus.emit("user data update", user);
}

export async function setBuiltinTag(userId: string, tagId: string) {
    const user = await readUser(userId);
    if (!user) return;

    const tag = builtinTags[tagId];
    if (!tag) return;

    user.tag = JSON.stringify(tag);
    await updateUser(user.id, user);

    propogateUser(user);
}

export async function setTag(userId: string, tag: Tag) {
    const user = await readUser(userId);
    if (!user) return;

    user.tag = JSON.stringify(tag);
    await updateUser(user.id, user);

    propogateUser(user);
}

export async function removeTag(userId: string) {
    const user = await readUser(userId);
    if (!user) return;

    user.tag = "";
    await updateUser(user.id, user);

    propogateUser(user);
}

export async function getTag(userId: string) {
    const user = await readUser(userId);
    if (!user) return;

    if (typeof user.tag !== "string") return;
    return JSON.parse(user.tag);
}
