export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
}

export class ApiClient {
  private config: Required<ApiClientConfig>;

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? "",
      timeoutMs: config.timeoutMs ?? 15000,
      retries: config.retries ?? 2,
    };
  }

  setBaseUrl(url: string) {
    this.config.baseUrl = url;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.fetchWithRetry<T>(url);
  }

  async getCached<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    const url = this.buildUrl(path, params);
    const cacheKey = `api:${url}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    try {
      const data = await this.fetchWithRetry<T>(url);
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } catch {
      return null;
    }
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const url = new URL(`${base}/${path.replace(/^\/+/, "")}`, window.location.origin);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async fetchWithRetry<T>(url: string, attempt = 0): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, res.status, url);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (attempt < this.config.retries) {
        return this.fetchWithRetry<T>(url, attempt + 1);
      }
      throw new ApiError(
        err instanceof Error ? err.message : "Unknown error",
        0,
        url,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export const apiClient = new ApiClient({
  timeoutMs: 10000,
  retries: 2,
});
