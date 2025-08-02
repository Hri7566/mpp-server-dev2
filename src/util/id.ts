import { createHash } from "crypto";
import env from "./env";
import { spoop_text } from "./helpers";
import { config } from "~/ws/usersConfig";
import { Logger } from "./Logger";
import crypto from "crypto";

const logger = new Logger("IDGen");

/**
 * Create a random 24-character hex ID
 * @returns Random ID
 */
export function createID() {
    // Maybe I could make this funnier than it needs to be...
    // return randomBytes(12).toString("hex");

    let weirdness = "";
    while (weirdness.length < 24) {
        const time = new Date().toString();
        const randomShit = spoop_text(time); // looks like this: We]%Cau&:,\u0018403*"32>8,B15&GP[2)='7\u0019-@etyhlw\u0017QqXqiime&Khhe-

        let index1 = Math.floor(Math.random() * randomShit.length);
        let index2 = Math.floor(Math.random() * randomShit.length);

        weirdness += randomShit.substring(index1, index2);
    }

    // Get 12 bytes
    return Buffer.from(weirdness.substring(0, 12)).toString("hex");
}

/**
 * Create a user ID based on their IP address
 * @param ip IP address of user
 * @returns User ID
 */
export function createUserIDFromIP(ip: string) {
    if (config.idGeneration == "random") {
        return createID();
    } else if (config.idGeneration == "sha256") {
        return createHash("sha256")
            .update(ip)
            .update(env.SALT)
            .digest("hex")
            .substring(0, 24);
    } else if (config.idGeneration == "mpp") {
        return createHash("md5")
            .update("::ffff:" + ip + env.SALT)
            .digest("hex")
            .substring(0, 24);
    } else {
        // Fallback if someone typed random garbage in the config
        return createID();
    }
}

/**
 * Create a random socket ID (UUID-based)
 * @returns Random socket ID
 */
export function createSocketID() {
    return crypto.randomUUID();
}

/**
 * Generate a user's color based on their user ID
 * @param _id User ID
 * @returns Hex color
 */
export function createColor(_id: string) {
    if (config.colorGeneration == "random") {
        return "#" + Math.floor(Math.random() * 16777215).toString(16);
    } else if (config.colorGeneration == "sha256") {
        return (
            "#" +
            createHash("sha256")
                .update(_id)
                .update(env.SALT)
                .digest("hex")
                .substring(24, 24 + 6)
        );
    } else if (config.colorGeneration == "mpp") {
        const hash = createHash("md5");
        hash.update(_id + env.COLOR_SALT);
        const output = hash.digest();

        let r = output.readUInt8(0);
        let g = output.readUInt8(1);
        let b = output.readUInt8(2);

        r -= 0x40;
        r += 0x20;
        r &= 0xff;

        g -= 0x40;
        g += 0x20;
        g &= 0xff;

        b -= 0x40;
        b += 0x20;
        b &= 0xff;

        while (r + g + b > 0xd6 * 3) {
            --r > 0 ? r : (r = 0);
            --g > 0 ? g : (g = 0);
            --b > 0 ? b : (b = 0);
        }

        return (
            "#" +
            r.toString(16).padStart(2, "0") +
            g.toString(16).padStart(2, "0") +
            b.toString(16).padStart(2, "0")
        );
    } else if (config.colorGeneration == "white") {
        return "#ffffff";
    } else {
        return "#" + Math.floor(Math.random() * 16777215).toString(16);
    }
}
