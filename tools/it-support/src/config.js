const path = require('path');
const fs = require('fs');
require('dotenv').config();

function parseCsv(value) {
	return String(value || '')
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean);
}

function resolveFrontendPath() {
	const fromEnv = process.env.FRONTEND_PATH;
	if (fromEnv && fs.existsSync(fromEnv)) {
		return path.resolve(fromEnv);
	}
	// if local Next.js export exists, prefer that
	const nextOut = path.resolve(__dirname, '..', 'frontend', 'out');
	if (fs.existsSync(nextOut)) {
		return nextOut;
	}
	// fallback to local public folder
	return path.resolve(__dirname, '..', 'public');
}

module.exports = {
	port: Number(process.env.PORT || 1104),
	host: process.env.HOST || '0.0.0.0',
	appName: process.env.APP_NAME || 'IT SUPPORT',
	defaultUser: process.env.DEFAULT_USER || '',
	corsOrigins: parseCsv(process.env.CORS_ORIGINS),
	frontendPath: resolveFrontendPath(),
	jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
	bootstrapKey: process.env.BOOTSTRAP_KEY || 'it-support-bootstrap',
	sheets: {
		id: process.env.SHEETS_ID || '',
		// Optional Apps Script endpoint for write (public web app), e.g. https://script.google.com/macros/s/XXX/exec
		appsScriptUrl: process.env.SHEETS_APPS_SCRIPT_URL || '',
	},
	ai: {
		url: process.env.AI_API_URL || '',
		apiKey: process.env.AI_API_KEY || '',
		model: process.env.AI_MODEL || '',
		timeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
	},
	zalo: {
		baseUrl: process.env.ZALO_API_BASE || 'https://salework.net',
		clientId: process.env.ZALO_CLIENT_ID || '',
		token: process.env.ZALO_TOKEN || '',
		timeoutMs: Number(process.env.ZALO_TIMEOUT_MS || 20000),
	},
	db: {
		file: (() => {
			const fromEnv = String(process.env.SQLITE_FILE || '').trim();
			if (fromEnv) return path.resolve(fromEnv);
			return path.resolve(__dirname, '..', 'data', 'it_support.sqlite');
		})(),
	},
};

