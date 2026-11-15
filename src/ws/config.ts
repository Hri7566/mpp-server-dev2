import { ConfigManager } from "~/util/config";

export interface ServerConfig {
    proxy: {
        /** Whether to read the client IP from a header set by a reverse proxy */
        enabled: boolean;
        /** Header the proxy puts the client IP in */
        header: string;
        /** IPs / IPv4 CIDR ranges of proxies allowed to set that header */
        trustedProxies: string[];
    };
    ssl: {
        enabled: boolean;
        /** Path to the PEM certificate (chain) */
        cert: string;
        /** Path to the PEM private key */
        key: string;
        /** Optional path to a CA bundle */
        ca: string;
        /** Optional passphrase for the private key */
        passphrase: string;
    };
}

export const serverConfigPath = "config/server.yml";

export const config = ConfigManager.loadConfig<ServerConfig>(serverConfigPath, {
    proxy: {
        enabled: true,
        header: "x-forwarded-for",
        trustedProxies: ["127.0.0.1", "::1"]
    },
    ssl: {
        enabled: false,
        cert: "",
        key: "",
        ca: "",
        passphrase: ""
    }
});
