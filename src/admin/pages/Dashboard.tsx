import { useEffect, useState } from "react";
import { api } from "../api";
import StatsCard from "../components/StatsCard";

interface Stats {
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
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);
      const response = await api.getStats();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
        <button onClick={loadStats} className="ml-4 underline">
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* User Stats */}
      <h2 className="text-lg font-semibold mb-4 text-gray-700">Users</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Users"
          value={stats.users.total}
          icon="👥"
          trend={{ value: stats.users.newThisWeek, label: "this week" }}
        />
        <StatsCard title="Admins" value={stats.users.admins} icon="🔐" />
        <StatsCard title="Banned" value={stats.users.banned} icon="🚫" />
        <StatsCard
          title="New This Week"
          value={stats.users.newThisWeek}
          icon="📈"
        />
      </div>

      {/* Subscription Stats */}
      <h2 className="text-lg font-semibold mb-4 text-gray-700">Subscriptions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Subscriptions"
          value={stats.subscriptions.total}
          icon="📋"
        />
        <StatsCard
          title="Active"
          value={stats.subscriptions.active}
          icon="✅"
          subtitle={`${((stats.subscriptions.active / stats.subscriptions.total) * 100 || 0).toFixed(1)}% of total`}
        />
        <StatsCard title="Expired" value={stats.subscriptions.expired} icon="⏰" />
        <StatsCard title="Cancelled" value={stats.subscriptions.cancelled} icon="❌" />
      </div>

      {/* Revenue Stats */}
      <h2 className="text-lg font-semibold mb-4 text-gray-700">Revenue</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Stars"
          value={`⭐ ${Number(stats.revenue.totalStars).toLocaleString()}`}
          icon="💫"
          trend={{
            value: Number(stats.revenue.thisWeek.stars),
            label: "this week",
          }}
        />
        <StatsCard
          title="Total TON"
          value={`💎 ${Number(stats.revenue.totalTon).toFixed(2)}`}
          icon="💰"
          trend={{
            value: Number(stats.revenue.thisWeek.ton),
            label: "this week",
          }}
        />
        <StatsCard
          title="Total Payments"
          value={stats.revenue.totalPayments}
          icon="🧾"
        />
        <StatsCard
          title="Payments This Week"
          value={stats.revenue.thisWeek.payments}
          icon="📊"
        />
      </div>

      {/* Infrastructure Stats */}
      <h2 className="text-lg font-semibold mb-4 text-gray-700">Infrastructure</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Servers"
          value={`${stats.servers.active} / ${stats.servers.total}`}
          subtitle="active / total"
          icon="🖥️"
        />
        <StatsCard
          title="Plans"
          value={`${stats.plans.active} / ${stats.plans.total}`}
          subtitle="active / total"
          icon="📦"
        />
      </div>
    </div>
  );
}
