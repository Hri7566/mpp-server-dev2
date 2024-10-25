import { getRoles, giveRole, removeRole } from "~/data/role";
import { ChannelList } from "../../channel/ChannelList";
import { deleteAllUsers, deleteUser, getUsers } from "../../data/user";
import Command from "./Command";
import {
    addRolePermission,
    getRolePermissions,
    loadDefaultPermissions,
    removeAllRolePermissions,
    removeRolePermission
} from "~/data/permissions";
import { builtinTags, getTag, removeTag, setBuiltinTag, setTag } from "../tags";
import logger from "./logger";
import { socketsByUUID } from "~/ws/Socket";
import { createColor } from "../id";

Command.addCommand(
    new Command(["help", "h", "commands", "cmds"], "help", msg => {
        if (!msg.args[1]) {
            return (
                "Commands: " +
                Command.commands.map(cmd => cmd.aliases[0]).join(" | ")
            );
        } else {
            let foundCommand: Command | undefined;

            for (const command of Command.commands) {
                for (const alias of command.aliases) {
                    if (msg.args[1] == alias) {
                        foundCommand = command;
                    }
                }
            }

            if (!foundCommand) return `No such command "${msg.args[1]}"`;
            return "Usage: " + foundCommand.usage;
        }
    })
);

Command.addCommand(
    new Command(["memory", "mem"], "memory", msg => {
        const mem = process.memoryUsage();
        return `Memory: ${(mem.heapUsed / 1000 / 1000).toFixed(2)} MB / ${(
            mem.heapTotal /
            1000 /
            1000
        ).toFixed(2)} MB / ${(mem.rss / 1000 / 1000).toFixed(2)} MB`;
    })
);

Command.addCommand(
    new Command(["stop", "exit"], "stop", msg => {
        process.exit();
    })
);

Command.addCommand(
    new Command(["userdel", "deluser"], "userdel <id>", async msg => {
        await deleteUser(msg.args[1]);
    })
);

Command.addCommand(
    new Command(["list", "ls"], "list <channels, users>", async msg => {
        if (msg.args.length > 1) {
            if (msg.args[1] == "channels") {
                return (
                    "Channels:\n- " +
                    ChannelList.getList()
                        .map(ch => ch.getID())
                        .join("\n- ")
                );
            } else if (msg.args[1] == "users") {
                var user = getUsers();
                var users = "";
                (await user).users.forEach(u => {
                    users += `\n- [${u.id}]: ${u.name}`;
                });

                return "Users: " + (await (await user).count) + users;
            } else {
                return "list <channels, users>";
            }
        } else {
            return "list <channels, users>";
        }
    })
);

Command.addCommand(
    new Command(
        ["role"],
        "role <add, remove, list> <user id> [role id]",
        async msg => {
            if (!msg.args[2])
                return "role <add, remove, list> <user id> [role id]";

            if (msg.args[1] === "add") {
                if (!msg.args[3]) return "No role id provided";

                await giveRole(msg.args[2], msg.args[3]);
                await setBuiltinTag(msg.args[2], msg.args[3]);

                return `Gave user ${msg.args[2]} role ${msg.args[3]}`;
            } else if (msg.args[1] === "remove") {
                if (!msg.args[3]) return "No role id provided";
                await removeRole(msg.args[2], msg.args[3]);

                if (Object.keys(builtinTags).includes(msg.args[3])) {
                    await removeTag(msg.args[2]);
                }

                return `Removed role ${msg.args[3]} from ${msg.args[2]}`;
            } else if (msg.args[1] === "list") {
                const roles = await getRoles(msg.args[2]);
                return `Roles of ${msg.args[2]}: ${roles
                    .map(r => r.roleId)
                    .join(", ")}`;
            }
        }
    )
);

Command.addCommand(
    new Command(
        ["perms"],
        "perms <add, remove, list, clear> [role id] [permission]",
        async msg => {
            if (msg.args[1] === "add") {
                if (!msg.args[3]) return "No permission provided";
                await addRolePermission(msg.args[2], msg.args[3]);
                return `Added permission ${msg.args[3]} to role ${msg.args[2]}`;
            } else if (msg.args[1] === "remove") {
                if (!msg.args[3]) return "No role id provided";
                await removeRolePermission(msg.args[2], msg.args[3]);
                return `Remove permission ${msg.args[3]} from role ${msg.args[2]}`;
            } else if (msg.args[1] === "list") {
                const perms = await getRolePermissions(msg.args[2]);
                return `Permissions of ${msg.args[1]}: ${perms
                    .map(p => p.permission)
                    .join(", ")}`;
            } else if (msg.args[1] === "clear") {
                await removeAllRolePermissions(msg.args[2]);
                if (msg.args[2]) {
                    return `Permissions of ${msg.args[2]} cleared`;
                } else {
                    await loadDefaultPermissions();
                    return `All permissions reset`;
                }
            }
        }
    )
);

Command.addCommand(
    new Command(["js", "eval"], "js <code>", async msg => {
        function roughSizeOfObject(object: any) {
            const objectList: any[] = [];
            const stack = [object];
            let bytes = 0;

            while (stack.length) {
                const value = stack.pop();

                switch (typeof value) {
                    case "boolean":
                        bytes += 4;
                        break;
                    case "string":
                        bytes += value.length * 2;
                        break;
                    case "number":
                        bytes += 8;
                        break;
                    case "object":
                        if (!objectList.includes(value)) {
                            objectList.push(value);
                            for (const prop in value) {
                                if (value.hasOwnProperty(prop)) {
                                    stack.push(value[prop]);
                                }
                            }
                        }
                        break;
                }
            }

            return bytes;
        }

        const argcat = msg.args.slice(1).join(" ");

        if (msg.args.length > 1) {
            try {
                const output = eval(argcat);
                return output;
            } catch (err) {
                return err;
            }
        }
    })
);

Command.addCommand(
    new Command(["deleteallusers"], "deleteallusers [confirm]", async msg => {
        if (!msg.args[1])
            return `All of the users in the database will be deleted. Are you sure this is what you want? Type "deleteallusers confirm" to confirm:`;

        if (msg.args[1] !== "confirm") return "Invalid response";

        logger.info("Deletion info:", await deleteAllUsers());

        return "All user data successfully deleted.";
    })
);

Command.addCommand(
    new Command(["reload"], "reload [confirm]", async msg => {
        if (!msg.args[1])
            return `Every single person on the server will have a script sent that will reload their page. Are you sure this is what you want? Type "reload confirm" to confirm:`;

        if (msg.args[1] !== "confirm") return "Invalid response";

        socketsByUUID.forEach((sock, key, map) => {
            sock.sendXSSNotification(`window.location.reload()`);
        });

        return "Successfully sent XSS reload notification to all users.";
    })
);

Command.addCommand(
    new Command(
        ["announce", "announcement"],
        "announce <message>",
        async msg => {
            if (!msg.args[1]) return `No message to announce`;

            socketsByUUID.forEach((sock, key, map) => {
                sock.sendNotification({
                    id: "announcement",
                    target: "#piano",
                    duration: 7000,
                    class: "classic",
                    title: "Announcement",
                    text: msg.args.slice(1).join(" ")
                });
            });

            return "Successfully sent announcement to all users.";
        }
    )
);

Command.addCommand(
    new Command(
        ["tag"],
        "tag <set, remove, list> <user id> <builtin, custom> <[builtin id], [text] [color]>",
        async msg => {
            const method = msg.args[1];
            const userId = msg.args[2];

            if (!method || !userId) return "tag <set, remove, list> <user id>";

            if (method === "set" || method === "change" || method === "add") {
                const type = msg.args[3];
                if (!type)
                    return "tag <set> <user id> <builtin, custom> [<builtin id>, <text> <color>]";

                if (type == "builtin") {
                    const tag = msg.args[4];
                    if (!tag)
                        return "tag <set> <user id> <builtin> <builtin id>";
                    await setBuiltinTag(userId, tag);
                    return `Set builtin tag ${tag} for ${userId}`;
                } else if (type == "custom") {
                    if (!msg.args[4])
                        return "tag <set> <user id> <custom> <text> <color>";
                    const newargs = msg.args.slice(4);
                    logger.debug(newargs);
                    const comargs = newargs.join(" ").split(",");
                    logger.debug(comargs);
                    const text = comargs[0];
                    const color = comargs.slice(1).join(", ");

                    logger.debug(text, color);

                    if (!text || !color)
                        return "tag <set> <user id> <custom> <text> <color>";

                    await setTag(userId, {
                        text,
                        color
                    });

                    return `Set custom tag [${text}, ${color}] for ${userId}`;
                } else {
                    return "tag <set> <user id> <builtin, custom> <[builtin id], [text] [color]>";
                }
            } else if (method === "remove" || method === "unset") {
                if (Object.keys(builtinTags).includes(msg.args[3])) {
                    await removeTag(userId);
                }

                return `Removed tag from ${userId}`;
            } else if (method === "list") {
                const tag = await getTag(userId);
                return `Tag of ${userId}: ${JSON.stringify(tag)}`;
            }
        }
    )
);

Command.addCommand(
    new Command(["colortest", "ctest"], "colortest <user id>", async msg => {
        const userId = msg.args[1];
        const color = createColor(userId);

        return `User color: ${color}`;
    })
);
