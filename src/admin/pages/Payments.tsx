import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";

interface Payment {
  id: number;
  userId: number;
  subscriptionId: number | null;
  amount: string;
  currency: string;
  status: string;
  providerId: string | null;
  createdAt: string;
  user: { telegramId: string; username: string | null; firstName: string | null } | null;
}

export default function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    status: "",
    currency: "",
  });

  useEffect(() => {
    loadPayments();
  }, [page, filters]);

  async function loadPayments() {
    try {
      setLoading(true);
      const response = await api.getPayments({
        page,
        status: filters.status || undefined,
        currency: filters.currency || undefined,
      });
      if (response.success && response.data) {
        setPayments(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.totalPages);
        }
      }
    } catch (err) {
      console.error("Failed to load payments:", err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      completed: "bg-green-100 text-green-700",
      pending: "bg-yellow-100 text-yellow-700",
      failed: "bg-red-100 text-red-700",
      refunded: "bg-gray-100 text-gray-700",
    };
    return styles[status] || "bg-gray-100 text-gray-700";
  }

  function getCurrencyIcon(currency: string) {
    return currency === "stars" ? "⭐" : "💎";
  }

  const columns = [
    {
      key: "id",
      header: "ID",
      render: (payment: Payment) => <span className="text-gray-500">#{payment.id}</span>,
    },
    {
      key: "user",
      header: "User",
      render: (payment: Payment) => (
        <div>
          {payment.user ? (
            <>
              <div className="font-medium">{payment.user.firstName || "Unknown"}</div>
              <div className="text-sm text-gray-500">
                {payment.user.username ? `@${payment.user.username}` : payment.user.telegramId}
              </div>
            </>
          ) : (
            <span className="text-gray-400">User #{payment.userId}</span>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (payment: Payment) => (
        <div className="font-medium">
          {getCurrencyIcon(payment.currency)} {Number(payment.amount).toLocaleString()}{" "}
          {payment.currency.toUpperCase()}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (payment: Payment) => (
        <span className={`px-2 py-1 text-xs rounded capitalize ${getStatusBadge(payment.status)}`}>
          {payment.status}
        </span>
      ),
    },
    {
      key: "subscription",
      header: "Subscription",
      render: (payment: Payment) =>
        payment.subscriptionId ? (
          <span className="text-sm text-gray-600">#{payment.subscriptionId}</span>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        ),
    },
    {
      key: "createdAt",
      header: "Date",
      render: (payment: Payment) => (
        <div className="text-sm">
          <div>{new Date(payment.createdAt).toLocaleDateString()}</div>
          <div className="text-gray-500">{new Date(payment.createdAt).toLocaleTimeString()}</div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Payments</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4">
          <select
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setPage(1);
            }}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <select
            value={filters.currency}
            onChange={(e) => {
              setFilters({ ...filters, currency: e.target.value });
              setPage(1);
            }}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Currencies</option>
            <option value="stars">Stars</option>
            <option value="ton">TON</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        loading={loading}
        emptyMessage="No payments found"
        pagination={{
          page,
          totalPages,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
