/* eslint-disable no-console */
const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

function run(command, args, cwd) {
	console.log(`\n▶ ${command} ${args.join(' ')} (cwd: ${cwd})`);
	const result = spawnSync(command, args, {
		cwd,
		stdio: 'inherit',
		shell: false,
		env: process.env,
	});
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}`);
	}
}

function ensureInstalled(dir, checkFile = null) {
	const nodeModulesPath = join(dir, 'node_modules');
	const ok =
		existsSync(nodeModulesPath) &&
		(checkFile ? existsSync(join(dir, checkFile)) : true);

	if (ok) {
		console.log(`✓ Dependencies already installed for: ${dir}`);
		return;
	}

	// Prefer npm ci if lockfile exists, otherwise npm install
	const hasLock = existsSync(join(dir, 'package-lock.json'));
	const args = hasLock
		? ['ci', '--no-audit', '--no-fund']
		: ['install', '--no-audit', '--no-fund'];

	run('npm', args, dir);
}

function main() {
	const root = process.cwd();

	// List nested workspaces that the root server relies on at runtime
	const nestedPackages = [
		{
			dir: join(root, 'tools', 'it-support'),
			// Check for a key runtime module that previously failed
			checkFile: join('node_modules', 'morgan', 'index.js'),
		},
		// Add more nested runtime packages here if needed in the future
		// { dir: join(root, 'tools', 'it-support-old') },
	];

	console.log('Bootstrapping nested dependencies...');
	for (const pkg of nestedPackages) {
		ensureInstalled(pkg.dir, pkg.checkFile);
	}
	console.log('Bootstrap complete.');
}

try {
	main();
} catch (err) {
	console.error('Bootstrap failed:', err && err.message ? err.message : err);
	process.exitCode = 1;
}

