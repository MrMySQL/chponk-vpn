import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

interface User {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  hasActiveSubscription: boolean;
  xuiClientEmail: string | null;
  createdAt: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [giftDays, setGiftDays] = useState(30);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [page, filter]);

  async function loadUsers() {
    try {
      setLoading(true);
      const response = await api.getUsers({ page, search: search || undefined, filter: filter || undefined });
      if (response.success && response.data) {
        setUsers(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.totalPages);
        }
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadUsers();
  }

  async function handleToggleAdmin(user: User) {
    setActionLoading(true);
    try {
      await api.updateUser(user.id, { isAdmin: !user.isAdmin });
      loadUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleBan(user: User) {
    setActionLoading(true);
    try {
      await api.updateUser(user.id, { isBanned: !user.isBanned });
      loadUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteUser(user: User) {
    if (!confirm(`Delete user ${user.firstName || user.username || user.telegramId}? This removes all their data and allows them to use the free trial again.`)) return;
    setActionLoading(true);
    try {
      await api.deleteUser(user.id);
      loadUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleGift() {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.giftSubscription(selectedUser.id, giftDays);
      setSelectedUser(null);
      loadUsers();
    } catch (err) {
      console.error("Failed to gift subscription:", err);
    } finally {
      setActionLoading(false);
    }
  }

  const columns = [
    {
      key: "id",
      header: "ID",
      render: (user: User) => <span className="text-gray-500">#{user.id}</span>,
    },
    {
      key: "user",
      header: "User",
      render: (user: User) => (
        <div>
          <div className="font-medium">{user.firstName || "Unknown"}</div>
          <div className="text-sm text-gray-500">
            {user.username ? `@${user.username}` : user.telegramId}
          </div>
          {user.xuiClientEmail && (
            <div className="text-xs text-gray-400">{user.xuiClientEmail}</div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (user: User) => (
        <div className="flex flex-wrap gap-1">
          {user.isAdmin && (
            <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
              Admin
            </span>
          )}
          {user.isBanned && (
            <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
              Banned
            </span>
          )}
          {user.hasActiveSubscription && (
            <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
              Active Sub
            </span>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (user: User) => new Date(user.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "Actions",
      render: (user: User) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleToggleAdmin(user)}
            disabled={actionLoading}
            className={`px-2 py-1 text-xs rounded ${
              user.isAdmin
                ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {user.isAdmin ? "Remove Admin" : "Make Admin"}
          </button>
          <button
            onClick={() => handleToggleBan(user)}
            disabled={actionLoading}
            className={`px-2 py-1 text-xs rounded ${
              user.isBanned
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-red-100 text-red-700 hover:bg-red-200"
            }`}
          >
            {user.isBanned ? "Unban" : "Ban"}
          </button>
          <button
            onClick={() => setSelectedUser(user)}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Gift
          </button>
          {!user.isAdmin && (
            <button
              onClick={() => handleDeleteUser(user)}
              disabled={actionLoading}
              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold">Users</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-3 md:p-4 mb-4 md:mb-6">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3 md:gap-4">
          <input
            type="text"
            placeholder="Search by username, name, or Telegram ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base"
          />
          <div className="flex gap-2 md:gap-4">
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className="flex-1 md:flex-none px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base"
            >
              <option value="">All Users</option>
              <option value="admin">Admins Only</option>
              <option value="banned">Banned Only</option>
            </select>
            <button
              type="submit"
              className="px-4 md:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm md:text-base whitespace-nowrap"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        emptyMessage="No users found"
        pagination={{
          page,
          totalPages,
          onPageChange: setPage,
        }}
      />

      {/* Gift Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={`Gift Subscription to ${selectedUser?.firstName || selectedUser?.username || "User"}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Days to Gift
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={giftDays}
              onChange={(e) => setGiftDays(parseInt(e.target.value) || 30)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setSelectedUser(null)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleGift}
              disabled={actionLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? "Gifting..." : `Gift ${giftDays} Days`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
