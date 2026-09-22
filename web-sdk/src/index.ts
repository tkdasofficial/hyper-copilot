/**
 * Hyper Vision Agent - Universal Web & Node TypeScript SDK
 *
 * Direct, high-performance port of the stateless native C++17 CDP engine.
 * Cross-environment compatible: Browser, Node.js, Express, Next.js, Vercel, Supabase, Cloudflare Workers.
 */

// Types & Errors
export * from "./types.js";

// Transport & Connection
export * from "./connection/websocket-adapter.js";
export * from "./connection/cdp-connection.js";

// Command Dispatcher
export * from "./dispatcher/command-dispatcher.js";

// Target Lifecycle
export * from "./target/target-session-manager.js";

// Launcher
export * from "./launcher/flags.js";
export * from "./launcher/process-launcher.js";

// Core Engine & Automation Surfaces
export * from "./core/page.js";
export * from "./core/browser-session.js";
export * from "./core/engine.js";

// Extensions
export * as extensions from "./extensions/index.js";
export { Screenshot } from "./extensions/screenshot.js";
export { Stealth } from "./extensions/stealth.js";
export { CaptchaSolver, CaptchaType } from "./extensions/captcha-solver.js";
export { ScreenRecorder } from "./extensions/screen-recorder.js";
export { DuckDuckGoSearch } from "./extensions/ddg-search.js";

// Lightweight Edge & Remote Dispatch Bridge
export * from "../lightweight-web-sdk.js";
export { LightweightWebSdk } from "../lightweight-web-sdk.js";

/**
 * Simple Data Fetching Functions
 * Optimized for lightweight in-app data retrieval, metadata parsing, and instant web searches.
 */
export async function simpleDataFetch(url: string) {
  return LightweightWebSdk.fetchQuickMetadata(url);
}

export async function simpleSearch(query: string) {
  return LightweightWebSdk.quickSearch(query);
}

export async function simpleFetchMetadata(url: string) {
  return LightweightWebSdk.fetchQuickMetadata(url);
}

// Default export
import { HyperVisionEngine } from "./core/engine.js";
export default HyperVisionEngine;
