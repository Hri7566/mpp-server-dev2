// Thank you Brandon for this thing
export class RateLimit {
    public after = 0;
    constructor(private interval_ms = 0) {}

    public attempt(time = Date.now()) {
        if (time < this.after) return false;

        this.after = time + this.interval_ms;
        return true;
    }

    public setInterval(interval_ms: number) {
        this.after += interval_ms - this.interval_ms;
        this.interval_ms = interval_ms;
    }
}
