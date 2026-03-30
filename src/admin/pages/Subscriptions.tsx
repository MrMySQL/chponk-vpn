import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

interface Subscription {
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
}

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, [page, statusFilter]);

  async function loadSubscriptions() {
    try {
      setLoading(true);
      const response = await api.getSubscriptions({
        page,
        status: statusFilter || undefined,
      });
      if (response.success && response.data) {
        setSubscriptions(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.totalPages);
        }
      }
    } catch (err) {
      console.error("Failed to load subscriptions:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(sub: Subscription, newStatus: string) {
    setActionLoading(true);
    try {
      await api.updateSubscription(sub.id, { status: newStatus });
      loadSubscriptions();
    } catch (err) {
      console.error("Failed to update subscription:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleExtend() {
    if (!selectedSub) return;
    setActionLoading(true);
    try {
      await api.updateSubscription(selectedSub.id, { extendDays });
      setSelectedSub(null);
      loadSubscriptions();
    } catch (err) {
      console.error("Failed to extend subscription:", err);
    } finally {
      setActionLoading(false);
    }
  }

  function formatBytes(bytes: string): string {
    const b = BigInt(bytes);
    if (b < BigInt(1024)) return `${b} B`;
    if (b < BigInt(1024 * 1024)) return `${(Number(b) / 1024).toFixed(1)} KB`;
    if (b < BigInt(1024 * 1024 * 1024)) return `${(Number(b) / (1024 * 1024)).toFixed(1)} MB`;
    return `${(Number(b) / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      active: "bg-green-100 text-green-700",
      expired: "bg-red-100 text-red-700",
      cancelled: "bg-gray-100 text-gray-700",
    };
    return styles[status] || "bg-gray-100 text-gray-700";
  }

  function getDaysRemaining(expiresAt: string): number {
    const now = new Date();
    const expiry = new Date(expiresAt);
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  const columns = [
    {
      key: "id",
      header: "ID",
      render: (sub: Subscription) => <span className="text-gray-500">#{sub.id}</span>,
    },
    {
      key: "user",
      header: "User",
      render: (sub: Subscription) => (
        <div>
          {sub.user ? (
            <>
              <div className="font-medium">{sub.user.firstName || "Unknown"}</div>
              <div className="text-sm text-gray-500">
                {sub.user.username ? `@${sub.user.username}` : sub.user.telegramId}
              </div>
              <div className="text-xs text-gray-400">ID: {sub.userId}</div>
            </>
          ) : (
            <span className="text-gray-400">User #{sub.userId}</span>
          )}
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (sub: Subscription) => (
        <div>
          <div className="font-medium">{sub.plan?.name || `Plan #${sub.planId}`}</div>
          <div className="text-sm text-gray-500">{sub.plan?.durationDays || "-"} days</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (sub: Subscription) => {
        const days = getDaysRemaining(sub.expiresAt);
        return (
          <div>
            <span className={`px-2 py-1 text-xs rounded capitalize ${getStatusBadge(sub.status)}`}>
              {sub.status}
            </span>
            {sub.status === "active" && (
              <div className={`text-xs mt-1 ${days <= 3 ? "text-red-600" : "text-gray-500"}`}>
                {days > 0 ? `${days} days left` : "Expires today"}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "traffic",
      header: "Traffic Used",
      render: (sub: Subscription) => (
        <span className="text-sm">{formatBytes(sub.trafficUsedBytes)}</span>
      ),
    },
    {
      key: "dates",
      header: "Period",
      render: (sub: Subscription) => (
        <div className="text-sm">
          <div>{new Date(sub.startsAt).toLocaleDateString()}</div>
          <div className="text-gray-500">to {new Date(sub.expiresAt).toLocaleDateString()}</div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (sub: Subscription) => (
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedSub(sub)}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Extend
          </button>
          {sub.status === "active" && (
            <button
              onClick={() => handleStatusChange(sub, "cancelled")}
              disabled={actionLoading}
              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Cancel
            </button>
          )}
          {sub.status === "expired" && (
            <button
              onClick={() => handleStatusChange(sub, "active")}
              disabled={actionLoading}
              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
            >
              Reactivate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold">Subscriptions</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-3 md:p-4 mb-4 md:mb-6">
        <div className="flex gap-2 md:gap-4">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="flex-1 md:flex-none px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={subscriptions}
        loading={loading}
        emptyMessage="No subscriptions found"
        pagination={{
          page,
          totalPages,
          onPageChange: setPage,
        }}
      />

      {/* Extend Modal */}
      <Modal
        isOpen={!!selectedSub}
        onClose={() => setSelectedSub(null)}
        title={`Extend Subscription #${selectedSub?.id}`}
      >
        <div className="space-y-4">
          {selectedSub && (
            <div className="text-sm text-gray-600">
              <p>
                <strong>User:</strong> {selectedSub.user?.firstName || selectedSub.user?.username || `#${selectedSub.userId}`}
              </p>
              <p>
                <strong>Current Expiry:</strong> {new Date(selectedSub.expiresAt).toLocaleDateString()}
              </p>
              <p>
                <strong>Status:</strong> {selectedSub.status}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Days to Add
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={extendDays}
              onChange={(e) => setExtendDays(parseInt(e.target.value) || 30)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setSelectedSub(null)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExtend}
              disabled={actionLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? "Extending..." : `Extend by ${extendDays} Days`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
