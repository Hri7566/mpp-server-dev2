import { loadConfig } from "./config";

export const config = loadConfig("config/util.yml", {
    enableLogFiles: true
});
