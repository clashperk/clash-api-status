import fetch from 'node-fetch';

const clans = [
	'#2P9UG82L', '#8QU8J9LP', '#L2L9PQY0', '#YVVCC92G', '#202UG8GGC', '#20Y2PP20P', '#28VLY802U',
	'#22PRJJUU', '#299URVRVQ', '#29RJU0PV2', '#29Y8PRCJR', '#2JC80JCP', '#2P0YCULVQ', '#2PP9G8GR8',
	'#2PPU0VJJ9', '#2VQPRVRU', '#2Y8LYLPL2', '#2YQ98UJVQ', '#2YQCPU0GP', '#2YY0RU90P', '#89QG2QCQ'
];

interface Promises {
	resolve(): void;
	promise: Promise<void>;
}

export class QueueThrottler {
	private sleepTime: number;
	private lastRun: number;
	private readonly promises: Promises[] = [];

	public constructor(rateLimit = 1) {
		this.sleepTime = 1000 / rateLimit;
		this.lastRun = Date.now();
	}

	public delay(ms: number) {
		return new Promise(res => setTimeout(res, ms));
	}

	public async throttle() {
		const difference = Date.now() - this.lastRun;
		const needToSleep = this.sleepTime - difference;

		if (needToSleep > 0) await this.delay(needToSleep);

		this.lastRun = Date.now();
		return this.shift();
	}

	public get remaining() {
		return this.promises.length;
	}

	public wait() {
		const next = this.promises.length ? this.promises[this.promises.length - 1].promise : Promise.resolve();
		let resolve: () => void;
		const promise = new Promise<void>(res => {
			resolve = res;
		});
		this.promises.push({ resolve: resolve!, promise });
		return next;
	}

	public shift() {
		const deferred = this.promises.shift();
		if (typeof deferred !== 'undefined') deferred.resolve();
	}
}

export default class Http {
	private keyCount = 1;
	private timeout = 5000;
	private tokenIndex = 0;
	private tokens: string[] = [];
	private queue = new QueueThrottler();
	private keyName = 'ClashPerk_API_Status_Token';

	public async fetch(path: string) {
		await this.queue.wait();

		try {
			const startTime = process.hrtime();
			await this.request(path);
			const timeTaken = process.hrtime(startTime);
			const value = (timeTaken[0] * 1000) + (timeTaken[1] / 1000000);
			return await this.post(value);
		} finally {
			await this.queue.throttle();
		}
	}

	private async post(value: number) {
		const res = await fetch(`https://api.statuspage.io/v1/pages/${'wnt8d8fnjz4v'}/metrics/${'nf3x97lgzwsq'}/data.json`, {
			method: 'POST',
			headers: {
				'Authorization': `OAuth ${process.env.API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ data: { timestamp: (Date.now() + 300000) / 1000, value } })
		});

		const data = await res.json();
		console.log(data);
		return Promise.resolve(value);
	}

	public async init() {
		for (const tag of clans) {
			await this.fetch(`/clans/${tag}`)
		}

		setTimeout(this.init.bind(this), 1000);
	}

	private get token() {
		const token = this.tokens[this.tokenIndex];
		this.tokenIndex = (this.tokenIndex + 1) >= this.tokens.length ? 0 : (this.tokenIndex + 1);
		return token;
	}

	private async request(path: string) {
		const res = await fetch(`https://api.clashofclans.com/v1${path}`, {
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: 'application/json'
			},
			timeout: Number(this.timeout)
		}).catch(() => null);

		const parsed = await res?.json().catch(() => null);
		if (!parsed) return { ok: false, statusCode: res?.status };

		const maxAge = res?.headers?.get('cache-control')?.split('=')[1] ?? 0;
		return Object.assign(parsed, { statusCode: res?.status, ok: res?.status === 200, maxAge: Number(maxAge) * 1000 });
	}

	public async login() {
		const res = await fetch('https://developer.clashofclans.com/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: process.env.SUPERCELL_EMAIL!,
				password: process.env.SUPERCELL_PASSWORD!
			})
		});

		const data = await res.json();
		if (data.status && data.status.message === 'ok') return this.getKeys(res.headers.get('set-cookie')!);
	}

	private async getKeys(cookie: string) {
		const res = await fetch('https://developer.clashofclans.com/api/apikey/list', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', cookie }
		});

		const data = await res.json();

		const keys = data.keys.filter((key: any) => key.name === this.keyName);
		if (!keys.length) return this.createKey(cookie);

		for (const key of keys) await this.revokeKey(key, cookie);
		return Promise.allSettled(new Array(this.keyCount).fill(0).map(() => this.createKey(cookie)));
	}

	private async revokeKey(key: any, cookie: string) {
		const res = await fetch('https://developer.clashofclans.com/api/apikey/revoke', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', cookie },
			body: JSON.stringify({ id: key.id })
		});

		return res.json();
	}

	private async createKey(cookie: string) {
		const res = await fetch('https://developer.clashofclans.com/api/apikey/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', cookie },
			body: JSON.stringify({ name: this.keyName, description: this.keyName, cidrRanges: [await this.getIP()] })
		});

		const data = await res.json();
		if (res.ok) {
			this.tokens.push(data.key.key);
			console.log('New Key Created!');
			return Promise.resolve();
		}
	}

	private async getIP() {
		const res = await fetch('https://api.ipify.org/');
		return res.text();
	}
}
