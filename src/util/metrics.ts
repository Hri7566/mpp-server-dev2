import client, { Registry } from "prom-client";
import { Logger } from "./Logger";

const logger = new Logger("Metrics Server");

export function startMetricsServer() {
    client.collectDefaultMetrics();
    logger.info("Starting Prometheus metrics server...");

    const server = Bun.serve({
        port: 9100,
        async fetch(req) {
            const res = new Response(await client.register.metrics());
            res.headers.set("Content-Type", client.register.contentType);
            return res;
        }
    });

    enableMetrics();
}

export const metrics = {
    concurrentUsers: new client.Histogram({
        name: "concurrent_users",
        help: "Number of concurrent users",
    }),
    callbacks: [],
    addCallback(callback: (...args: any[]) => void | Promise<void>) {
        (this.callbacks as ((...args: any[]) => void)[]).push(callback);
    }
}

function enableMetrics() {
    setInterval(() => {
        (metrics.callbacks as ((...args: any[]) => void)[]).forEach(callback => callback());
    }, 5000);
}
