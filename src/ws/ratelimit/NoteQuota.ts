// Replicated note quota class from client
// with types!
export class NoteQuota {
    public allowance = 8000;
    public max = 24000;
    public maxHistLen = 3;
    public points = 24000;
    public history = new Array<number>();

    public static PARAMS_LOBBY = { allowance: 200, max: 600 };
    public static PARAMS_NORMAL = { allowance: 400, max: 1200 };
    public static PARAMS_RIDICULOUS = { allowance: 600, max: 1800 };
    public static PARAMS_OFFLINE = {
        allowance: 8000,
        max: 24000,
        maxHistLen: 3
    };

    constructor(public cb?: (points: number) => void) {
        this.setParams();
        this.resetPoints();
    }

    public getParams() {
        return {
            m: "nq",
            allowance: this.allowance,
            max: this.max,
            maxHistLen: this.maxHistLen
        };
    }

    public setParams(
        params: {
            allowance: number;
            max: number;
            maxHistLen?: number;
        } = NoteQuota.PARAMS_OFFLINE
    ) {
        const allowance: number =
            params.allowance ||
            this.allowance ||
            NoteQuota.PARAMS_OFFLINE.allowance;
        const max = params.max || this.max || NoteQuota.PARAMS_OFFLINE.max;
        const maxHistLen =
            params.maxHistLen ||
            this.maxHistLen ||
            NoteQuota.PARAMS_OFFLINE.maxHistLen;

        if (
            allowance !== this.allowance ||
            max !== this.max ||
            maxHistLen !== this.maxHistLen
        ) {
            this.allowance = allowance;
            this.max = max;
            this.maxHistLen = maxHistLen;

            this.resetPoints();
            return true;
        }

        return false;
    }

    public resetPoints() {
        this.points = this.max;
        this.history = [];

        for (let i = 0; i < this.maxHistLen; i++) {
            this.history.unshift(this.points);
        }

        if (this.cb) {
            this.cb(this.points);
        }
    }

    public tick() {
        this.history.unshift(this.points);
        this.history.length = this.maxHistLen;

        if (this.points < this.max) {
            this.points += this.allowance;
            if (this.points > this.max) this.points = this.max;
            if (this.cb) this.cb(this.points);
        }
    }

    public spend(needed: number) {
        let sum = 0;
        let numNeeded = needed;

        for (const i in this.history) {
            sum += this.history[i];
        }

        if (sum <= 0) numNeeded *= this.allowance;
        if (this.points < numNeeded) return false;

        this.points -= numNeeded;
        if (this.cb) this.cb(this.points);

        return true;
    }
}
