import { readdirSync } from "node:fs";
import { join } from "node:path/posix";
import { EventID, ServerEventListener } from "~/util/types";

const dir = "./src/events/user/handlers";

export async function getUserHandlers() {
    const files = readdirSync(dir);
    const modules = [];

    for (const file of files) {
        if (!file.endsWith(".ts")) continue;

        try {
            modules.push(await import("./" + join("handlers", file)));
        } catch (err) {
            console.error(err);
        }
    }

    return modules.map(
        m => Object.values(m)[0] as ServerEventListener<EventID>
    );
}
