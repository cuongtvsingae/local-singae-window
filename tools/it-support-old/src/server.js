const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { db } = require('./db'); // ensures DB init (migrations + seed)

const app = express();

app.set('trust proxy', true);
const allowedOrigins = new Set(config.corsOrigins || []);
app.use((req, res, next) => {
	cors({
		origin: (origin, cb) => {
			// Requests without Origin (curl, server-to-server, some same-origin cases).
			if (!origin) return cb(null, true);
			if (allowedOrigins.size === 0) return cb(null, true);
			if (allowedOrigins.has(origin)) return cb(null, true);
			// Same host as this server (localhost, LAN IP, domain, any port) — avoids blocking
			// single-server deploy when CORS_ORIGINS only lists dev origins like localhost:3000.
			const host = req.get('host');
			if (host) {
				const self = `${req.protocol}://${host}`;
				if (origin === self) return cb(null, true);
			}
			return cb(new Error(`CORS blocked for origin: ${origin}`));
		},
		credentials: true,
	})(req, res, next);
});
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

function redactHeaders(headers) {
	const h = { ...(headers || {}) };
	for (const k of Object.keys(h)) {
		if (k.toLowerCase() === 'authorization') h[k] = '[REDACTED]';
		if (k.toLowerCase() === 'cookie') h[k] = '[REDACTED]';
	}
	return h;
}

// Full request/response logging to SQLite (admin can view in dashboard)
app.use((req, res, next) => {
	const start = Date.now();
	const reqHeaders = redactHeaders(req.headers);
	const reqBody = req.body;
	const ip = req.ip;
	const userId = req.user?.id || null; // may be set by auth middleware on some routes

	let resBodyText = '';
	const origJson = res.json.bind(res);
	const origSend = res.send.bind(res);

	res.json = (body) => {
		try {
			resBodyText = JSON.stringify(body);
		} catch {
			resBodyText = String(body);
		}
		return origJson(body);
	};

	res.send = (body) => {
		try {
			resBodyText = typeof body === 'string' ? body : JSON.stringify(body);
		} catch {
			resBodyText = String(body);
		}
		return origSend(body);
	};

	res.on('finish', () => {
		const duration = Date.now() - start;
		const status = res.statusCode;
		const pathOnly = req.originalUrl || req.path || '';
		const resHeaders = redactHeaders(res.getHeaders());
		// skip static assets to reduce noise
		if (pathOnly.startsWith('/_next/') || pathOnly.endsWith('.js') || pathOnly.endsWith('.css') || pathOnly.endsWith('.map') || pathOnly.endsWith('.ico')) {
			return;
		}
		db.run(
			`INSERT INTO http_logs (method, path, status, duration_ms, ip, user_id, req_headers_json, req_body_json, res_headers_json, res_body_text)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				req.method,
				String(pathOnly),
				Number(status),
				Number(duration),
				String(ip || ''),
				userId,
				JSON.stringify(reqHeaders || {}),
				JSON.stringify(reqBody ?? null),
				JSON.stringify(resHeaders || {}),
				String(resBodyText || ''),
			]
		);
	});

	next();
});

// Health endpoint
app.get('/health', (_req, res) => {
	res.json({ status: 'ok', app: config.appName, port: config.port });
});

// APIs
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/v1', require('./routes/v1'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));

// Static frontend
const staticPath = config.frontendPath;
app.use(
	express.static(staticPath, {
		index: false,
		maxAge: '1h',
		setHeaders: (res, filePath) => {
			// Never cache HTML. The HTML references hashed assets; caching HTML causes users to miss UI updates.
			if (String(filePath || '').endsWith('.html')) {
				res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
				res.setHeader('Pragma', 'no-cache');
				res.setHeader('Expires', '0');
			}
		},
	})
);

// Static-export fallback:
// - For Next `output: export` with `trailingSlash: true`, pages live at /path/index.html
// - Serve that if it exists; otherwise fall back to /index.html
app.use((req, res, next) => {
	try {
		const cleanPath = decodeURIComponent(req.path || '/');
		const candidates = [];
		// /register/ -> <static>/register/index.html
		if (cleanPath.endsWith('/')) {
			candidates.push(path.join(staticPath, cleanPath, 'index.html'));
		} else {
			// /register -> <static>/register/index.html
			candidates.push(path.join(staticPath, cleanPath, 'index.html'));
			// /something.html -> <static>/something.html
			if (cleanPath.endsWith('.html')) candidates.push(path.join(staticPath, cleanPath));
		}
		// root fallback
		candidates.push(path.join(staticPath, 'index.html'));

		const target = candidates.find((p) => fs.existsSync(p));
		if (!target) return next();
		return res.sendFile(target);
	} catch {
		return next();
	}
});

app.listen(config.port, config.host, () => {
	console.log(`[${config.appName}] listening on http://${config.host}:${config.port}`);
	console.log(`Serving static from: ${staticPath}`);
});

