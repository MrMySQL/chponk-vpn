/**
 * Low-level HTTP client for 3x-ui API with cookie-based session management
 */

import type { XuiServerConfig, XuiApiResponse } from "./types";
import { XuiAuthError, XuiNetworkError, XuiApiError } from "./errors";

export class XuiHttpClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private sessionCookie: string | null = null;

  constructor(config: XuiServerConfig) {
    const protocol = config.secure ? "https" : "http";
    this.baseUrl = `${protocol}://${config.host}:${config.port}`;
    this.username = config.username;
    this.password = config.password;
  }

  /**
   * Authenticate with the 3x-ui panel and store session cookie
   */
  async login(): Promise<void> {
    const url = `${this.baseUrl}/login`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: this.username,
          password: this.password,
        }),
      });
    } catch (error) {
      throw new XuiNetworkError(
        `Failed to connect to 3x-ui panel at ${this.baseUrl}`,
        error instanceof Error ? error : undefined
      );
    }

    if (!response.ok) {
      throw new XuiAuthError(
        `Login failed with status ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as XuiApiResponse;

    if (!data.success) {
      throw new XuiAuthError(data.msg || "Login failed");
    }

    // Extract session cookie from Set-Cookie header
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      // Parse the session cookie (format: "3x-ui=xxx; Path=/; ...")
      const match = setCookie.match(/3x-ui=([^;]+)/);
      if (match) {
        this.sessionCookie = `3x-ui=${match[1]}`;
      }
    }

    if (!this.sessionCookie) {
      throw new XuiAuthError("No session cookie received after login");
    }
  }

  /**
   * Make an authenticated request to the API
   * Auto-logs in on first request and retries on session expiry
   */
  async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown> | URLSearchParams
  ): Promise<T> {
    // Auto-login if no session
    if (!this.sessionCookie) {
      await this.login();
    }

    const result = await this.doRequest<T>(method, path, body);

    // If unauthorized, try to re-authenticate once
    if (result.needsReauth) {
      this.sessionCookie = null;
      await this.login();
      const retryResult = await this.doRequest<T>(method, path, body);
      if (retryResult.needsReauth) {
        throw new XuiAuthError("Session expired and re-login failed");
      }
      return retryResult.data!;
    }

    return result.data!;
  }

  private async doRequest<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown> | URLSearchParams
  ): Promise<{ data?: T; needsReauth?: boolean }> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Cookie: this.sessionCookie!,
    };

    let requestBody: string | undefined;
    if (body) {
      if (body instanceof URLSearchParams) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        requestBody = body.toString();
      } else {
        headers["Content-Type"] = "application/json";
        requestBody = JSON.stringify(body);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: requestBody,
      });
    } catch (error) {
      throw new XuiNetworkError(
        `Request failed: ${method} ${path}`,
        error instanceof Error ? error : undefined
      );
    }

    // Check for auth errors
    if (response.status === 401 || response.status === 403) {
      return { needsReauth: true };
    }

    if (!response.ok) {
      throw new XuiApiError(
        `API request failed: ${method} ${path}`,
        response.status,
        response.statusText
      );
    }

    const data = (await response.json()) as XuiApiResponse<T>;

    if (!data.success) {
      throw new XuiApiError(
        data.msg || "API request failed",
        undefined,
        data.msg
      );
    }

    return { data: data.obj };
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  /**
   * Make a POST request with JSON body
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  /**
   * Make a POST request with form data
   */
  async postForm<T>(path: string, data: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, new URLSearchParams(data));
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this.sessionCookie !== null;
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    this.sessionCookie = null;
  }
}
