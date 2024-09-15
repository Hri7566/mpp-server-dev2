import { ConfigManager } from "./config";

export const config = ConfigManager.loadConfig("config/util.yml", {
    enableLogFiles: true
});
