import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";

// Persists the MCP OAuth session (dynamic client registration, PKCE verifier,
// tokens) to a single file so a Robinhood connection survives server restarts.
// RobinView registers itself as its own OAuth client - it does not reuse any
// other app's credentials.
interface Store {
  clientInformation?: any;
  tokens?: any;
  codeVerifier?: string;
  state?: string;
}

export class FileOAuthProvider implements OAuthClientProvider {
  private file: string;
  private data: Store = {};
  /** Set by the SDK when interactive authorization is required. */
  lastAuthUrl: URL | null = null;
  onRedirect?: (url: URL) => void;

  constructor(
    private redirectUri: string,
    dataDir = process.env.ROBINVIEW_DATA_DIR || join(homedir(), ".robinview"),
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "robinhood-auth.json");
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(readFileSync(this.file, "utf8"));
      } catch {
        this.data = {};
      }
    }
  }

  private flush() {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  get redirectUrl() {
    return this.redirectUri;
  }

  get clientMetadata() {
    return {
      client_name: "RobinView",
      redirect_uris: [this.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    } as any;
  }

  state(): string {
    if (!this.data.state) {
      this.data.state = randomBytes(24).toString("hex");
      this.flush();
    }
    return this.data.state;
  }

  clientInformation() {
    return this.data.clientInformation;
  }
  saveClientInformation(info: any) {
    this.data.clientInformation = info;
    this.flush();
  }

  tokens() {
    return this.data.tokens;
  }
  saveTokens(tokens: any) {
    this.data.tokens = tokens;
    this.flush();
  }

  saveCodeVerifier(v: string) {
    this.data.codeVerifier = v;
    this.flush();
  }
  codeVerifier(): string {
    if (!this.data.codeVerifier) throw new Error("no PKCE code verifier saved");
    return this.data.codeVerifier;
  }

  redirectToAuthorization(url: URL) {
    this.lastAuthUrl = url;
    this.onRedirect?.(url);
  }

  // Method accessors (not narrowed by control-flow analysis across the SDK's
  // redirectToAuthorization callback).
  getLastAuthUrl(): URL | null {
    return this.lastAuthUrl;
  }
  resetAuthUrl() {
    this.lastAuthUrl = null;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") {
      this.data = {};
      if (existsSync(this.file)) rmSync(this.file);
      return;
    }
    if (scope === "tokens") delete this.data.tokens;
    if (scope === "client") delete this.data.clientInformation;
    if (scope === "verifier") delete this.data.codeVerifier;
    this.flush();
  }

  hasTokens(): boolean {
    return !!this.data.tokens?.access_token;
  }

  clearAll() {
    this.invalidateCredentials("all");
  }
}
