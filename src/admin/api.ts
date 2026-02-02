const API_BASE = "/api/admin";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem("admin_token");
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem("admin_token", token);
    } else {
      localStorage.removeItem("admin_token");
    }
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        this.setToken(null);
        window.location.href = "/login";
      }
      throw new Error(data.error || "Request failed");
    }

    return data;
  }

  // Auth
  async login(telegramData: Record<string, string>) {
    const response = await this.request<{
      token: string;
      user: { id: number; telegramId: string; username: string; firstName: string };
    }>("/auth", {
      method: "POST",
      body: JSON.stringify(telegramData),
    });

    if (response.success && response.data?.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  logout() {
    this.setToken(null);
    window.location.href = "/login";
  }

  // Stats
  async getStats() {
    return this.request<{
      users: { total: number; admins: number; banned: number; newThisWeek: number };
      subscriptions: { total: number; active: number; expired: number; cancelled: number };
      revenue: {
        totalStars: string;
        totalTon: string;
        totalPayments: number;
        thisWeek: { payments: number; stars: string; ton: string };
      };
      servers: { total: number; active: number };
      plans: { total: number; active: number };
    }>("/stats");
  }

  // Users
  async getUsers(params?: { page?: number; limit?: number; search?: string; filter?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.search) query.set("search", params.search);
    if (params?.filter) query.set("filter", params.filter);
    return this.request<Array<{
      id: number;
      telegramId: string;
      username: string | null;
      firstName: string | null;
      isAdmin: boolean;
      isBanned: boolean;
      hasActiveSubscription: boolean;
      createdAt: string;
    }>>(`/users?${query}`);
  }

  async getUser(id: number) {
    return this.request(`/users?id=${id}`);
  }

  async updateUser(id: number, data: { isAdmin?: boolean; isBanned?: boolean }) {
    return this.request(`/users?id=${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async giftSubscription(userId: number, days: number) {
    return this.request(`/users?id=${userId}&action=gift`, {
      method: "POST",
      body: JSON.stringify({ days }),
    });
  }

  // Servers
  async getServers(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    return this.request<Array<{
      id: number;
      name: string;
      location: string;
      flagEmoji: string | null;
      host: string;
      domain: string;
      isActive: boolean;
      connectionCount: number;
      createdAt: string;
      updatedAt: string;
    }>>(`/servers?${query}`);
  }

  async getServer(id: number) {
    return this.request<{
      id: number;
      name: string;
      location: string;
      flagEmoji: string | null;
      host: string;
      domain: string;
      xuiPort: number;
      xuiBasePath: string | null;
      xuiUsername: string;
      inboundId: number;
      realityPort: number;
      realityDest: string;
      realitySni: string;
      realityPublicKey: string | null;
      realityShortId: string | null;
      isActive: boolean;
      activeConnections: number;
      createdAt: string;
      updatedAt: string;
    }>(`/servers?id=${id}`);
  }

  async createServer(data: Record<string, unknown>) {
    return this.request("/servers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateServer(id: number, data: Record<string, unknown>) {
    return this.request(`/servers?id=${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteServer(id: number) {
    return this.request(`/servers?id=${id}`, {
      method: "DELETE",
    });
  }

  // Plans
  async getPlans(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    return this.request<Array<{
      id: number;
      name: string;
      durationDays: number;
      priceStars: number;
      priceTon: string;
      trafficLimitGb: number | null;
      maxDevices: number;
      isActive: boolean;
      activeSubscriptions: number;
      createdAt: string;
    }>>(`/plans?${query}`);
  }

  async getPlan(id: number) {
    return this.request(`/plans?id=${id}`);
  }

  async createPlan(data: Record<string, unknown>) {
    return this.request("/plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updatePlan(id: number, data: Record<string, unknown>) {
    return this.request(`/plans?id=${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deletePlan(id: number) {
    return this.request(`/plans?id=${id}`, {
      method: "DELETE",
    });
  }

  // Payments
  async getPayments(params?: {
    page?: number;
    limit?: number;
    userId?: number;
    status?: string;
    currency?: string;
    from?: string;
    to?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.userId) query.set("userId", String(params.userId));
    if (params?.status) query.set("status", params.status);
    if (params?.currency) query.set("currency", params.currency);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return this.request<Array<{
      id: number;
      userId: number;
      subscriptionId: number | null;
      amount: string;
      currency: string;
      status: string;
      providerId: string | null;
      createdAt: string;
      user: { telegramId: string; username: string | null; firstName: string | null } | null;
    }>>(`/payments?${query}`);
  }

  // Subscriptions
  async getSubscriptions(params?: { page?: number; limit?: number; userId?: number; status?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.userId) query.set("userId", String(params.userId));
    if (params?.status) query.set("status", params.status);
    return this.request<Array<{
      id: number;
      userId: number;
      planId: number;
      status: string;
      startsAt: string;
      expiresAt: string;
      trafficUsedBytes: string;
      createdAt: string;
      user: { telegramId: string; username: string | null; firstName: string | null } | null;
      plan: { name: string; durationDays: number } | null;
    }>>(`/subscriptions?${query}`);
  }

  async getSubscription(id: number) {
    return this.request(`/subscriptions?id=${id}`);
  }

  async updateSubscription(id: number, data: { status?: string; extendDays?: number }) {
    return this.request(`/subscriptions?id=${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Connections
  async getServerConnections(serverId: number) {
    return this.request<Array<{
      id: number;
      xuiClientEmail: string;
      trafficUp: string;
      trafficDown: string;
      lastSyncedAt: string | null;
      createdAt: string;
      subscription: {
        id: number;
        status: string;
        expiresAt: string;
      };
      user: {
        id: number;
        telegramId: string;
        username: string | null;
        firstName: string | null;
      };
    }>>(`/servers?id=${serverId}&connections=true`);
  }

  async deleteConnection(connectionId: number) {
    return this.request(`/servers?connectionId=${connectionId}`, {
      method: "DELETE",
    });
  }

  // Traffic Sync
  async syncTraffic() {
    return this.request<{
      serversProcessed: number;
      connectionsUpdated: number;
      totalBytesUp: string;
      totalBytesDown: string;
    }>("/sync-traffic", {
      method: "POST",
    });
  }
}

export const api = new ApiClient();
