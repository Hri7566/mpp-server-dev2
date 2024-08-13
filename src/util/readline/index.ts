import readline from "readline";
import logger from "./logger";
import Command from "./Command";
import "./commands";

export let rl: readline.Interface;

// Turned into a function so the import isn't in a weird spot
export function startReadline() {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.setPrompt("mpps> ");
    rl.prompt();

    rl.on("line", async line => {
        const out = await Command.handleCommand(line);
        logger.info(out);
        rl.prompt();
    });

    rl.on("SIGINT", () => {
        process.exit();
    });

    // Fucking cringe but it works
    (globalThis as unknown as any).rl = rl;
}

export function stopReadline() {
    rl.close();
}
