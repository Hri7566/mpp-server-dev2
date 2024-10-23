import { ConfigManager } from "./config";

export const notificationConfig = ConfigManager.loadConfig<{
    allowXSS: boolean;
    maxDuration: number;
    defaultDuration: number;
    allTarget: string;
}>("config/notifications.yml", {
    allowXSS: true,
    maxDuration: 60000,
    defaultDuration: 7000,
    allTarget: "all"
});
