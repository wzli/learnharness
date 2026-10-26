import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Desktop target (Electron wrapper, 2026-09-17): standalone output = a
	// self-contained .next/standalone/server.js the Electron shell spawns
	// on 127.0.0.1. Harmless for plain web deploys (extra build output).
	// The manual copies the docs require — public/ and .next/static — are
	// done by scripts/build-server.mjs.
	outputFileTracingExcludes: {
		"*": [
			"**/data/**/*",
			"auth.json",
			".env*",
		],
	},
	// Empirically verified gaps (2026-09-17 standalone smoke): the tracer
	// misses JSON loaded via `import ... with { type: "json" }` attributes —
	// pi-ai's provider catalog (39 JSON files) vanished from the trace and
	// the server 500s on module load. Include the whole data dirs of the
	// runtime-loaded engine packages.
	// pdfjs-dist (sources v0 live smoke, 2026-09-19): its legacy build loads
	// the node fake worker (pdf.worker.mjs) and our standard_fonts dir via
	// runtime-resolved paths — invisible to the tracer. Bundling (without
	// serverExternalPackages below) additionally breaks the worker's
	// import.meta.url resolution inside .next/dev chunks — the live smoke
	// caught it; unit tests run unbundled and never see it.
	outputFileTracingIncludes: {
		"*": [
			// The standalone trace omitted this entire runtime-imported directory
			// in 0.3.0, so importing puppeteer-core failed before browser startup.
			"node_modules/@puppeteer/browsers/lib/browser-data/**/*.js",
			"node_modules/pdfjs-dist/legacy/**/*",
			"node_modules/pdfjs-dist/standard_fonts/**/*",
			// Wave E (2026-10-10): pdf_render paints via @napi-rs/canvas — its
			// platform binary (@napi-rs/canvas-<platform>-<arch>) is a dynamic
			// optional-dep require the tracer cannot see. Builds run per-OS and
			// npm installs only the current platform's binary, so this glob
			// resolves to exactly one Skia binary per build.
			"node_modules/@napi-rs/canvas-*/**/*",
			// Wave E stage 2: resvg rasterizes visual-maker SVGs natively; same
			// per-platform-binary story as the canvas above (one per build).
			"node_modules/@resvg/resvg-js-*/**/*",
			"node_modules/@earendil-works/pi-ai/dist/providers/data/**/*",
			// Public native OAuth factories load these flows through variable imports.
			// Electron main uses the same standalone SDK; the offline runtime gate
			// evaluates their real toAuth paths without login or provider requests.
			"node_modules/@earendil-works/pi-ai/dist/auth/oauth/{load,github-copilot,xai,device-code}.js",
			"node_modules/@earendil-works/pi-ai/dist/utils/sleep.js",
			"node_modules/@earendil-works/pi-agent-core/dist/**/*.json",
			// Next 16.3.2 native Turbopack applies unanchored excludes while
			// traversing modules; **/data/**/* still prunes gcp-metadata and
			// its private runtime chain. Includes are applied after traversal.
			// This is the verified GoogleAuth closure, not a general dep copy;
			// the offline native Pi gate must catch future SDK closure changes.
			"node_modules/gcp-metadata/**/*",
			"node_modules/json-bigint/**/*",
			"node_modules/bignumber.js/**/*",
		],
	},
	// Framework-free core lives in src/ (plain TS, imported by routes and CLI alike).
	// The pi engine must stay external: its providers are runtime-loaded Node
	// code (undici streams, catalog data) that breaks when bundled into routes.
	serverExternalPackages: [
		"@earendil-works/pi-ai",
		"@earendil-works/pi-agent-core",
		"pdfjs-dist", // sources v0: bundling breaks its node fake-worker path
		"@napi-rs/canvas", // native binding — bundling breaks the .node require
		"@resvg/resvg-js", // native binding — same
	],
	webpack: (config, { isServer, webpack }) => {
		if (!isServer) {
			config.plugins.push(
				new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
					resource.request = resource.request.replace(/^node:/, "");
				}),
			);
			config.resolve.fallback = {
				...config.resolve.fallback,
				crypto: false,
				fs: false,
				path: false,
			};
		}
		return config;
	},
};

export default nextConfig;