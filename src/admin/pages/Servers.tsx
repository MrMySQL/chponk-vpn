import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

interface ServerListItem {
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
}

interface ConnectionInfo {
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
}

interface ServerDetail extends ServerListItem {
  xuiPort: number;
  xuiBasePath: string | null;
  xuiUsername: string;
  inboundId: number;
  realityPort: number;
  realityDest: string;
  realitySni: string;
  realityPublicKey: string | null;
  realityShortId: string | null;
}

interface ServerForm {
  name: string;
  location: string;
  flagEmoji: string;
  host: string;
  domain: string;
  xuiPort: number;
  xuiBasePath: string;
  xuiUsername: string;
  xuiPassword: string;
  inboundId: number;
  realityPort: number;
  realityDest: string;
  realitySni: string;
  realityPublicKey: string;
  realityShortId: string;
}

const emptyForm: ServerForm = {
  name: "",
  location: "",
  flagEmoji: "",
  host: "",
  domain: "",
  xuiPort: 2053,
  xuiBasePath: "",
  xuiUsername: "",
  xuiPassword: "",
  inboundId: 1,
  realityPort: 443,
  realityDest: "",
  realitySni: "",
  realityPublicKey: "",
  realityShortId: "",
};

export default function Servers() {
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ServerForm>(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionsModal, setConnectionsModal] = useState<{
    server: ServerListItem;
    connections: ConnectionInfo[];
    loading: boolean;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    connectionsUpdated: number;
    serversProcessed: number;
  } | null>(null);

  useEffect(() => {
    loadServers();
  }, [page]);

  async function loadServers() {
    try {
      setLoading(true);
      const response = await api.getServers({ page });
      if (response.success && response.data) {
        setServers(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.totalPages);
        }
      }
    } catch (err) {
      console.error("Failed to load servers:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
    setShowModal(true);
  }

  async function openEditModal(server: ServerListItem) {
    setEditingId(server.id);
    setError(null);
    setShowModal(true);

    // Fetch full server details
    try {
      const response = await api.getServer(server.id);
      if (response.success && response.data) {
        const s = response.data;
        setForm({
          name: s.name,
          location: s.location,
          flagEmoji: s.flagEmoji || "",
          host: s.host,
          domain: s.domain,
          xuiPort: s.xuiPort,
          xuiBasePath: s.xuiBasePath || "",
          xuiUsername: s.xuiUsername,
          xuiPassword: "", // Don't populate password - only set if changing
          inboundId: s.inboundId,
          realityPort: s.realityPort,
          realityDest: s.realityDest,
          realitySni: s.realitySni,
          realityPublicKey: s.realityPublicKey || "",
          realityShortId: s.realityShortId || "",
        });
      }
    } catch (err) {
      console.error("Failed to load server details:", err);
      setForm({
        name: server.name,
        location: server.location,
        flagEmoji: server.flagEmoji || "",
        host: server.host,
        domain: server.domain,
        xuiPort: 2053,
        xuiBasePath: "",
        xuiUsername: "",
        xuiPassword: "",
        inboundId: 1,
        realityPort: 443,
        realityDest: "",
        realitySni: "",
        realityPublicKey: "",
        realityShortId: "",
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    try {
      if (editingId) {
        const updates: Record<string, unknown> = {};
        if (form.name) updates.name = form.name;
        if (form.location) updates.location = form.location;
        updates.flagEmoji = form.flagEmoji || null;
        if (form.host) updates.host = form.host;
        if (form.xuiPort) updates.xuiPort = form.xuiPort;
        updates.xuiBasePath = form.xuiBasePath || null;
        if (form.xuiUsername) updates.xuiUsername = form.xuiUsername;
        if (form.xuiPassword) updates.xuiPassword = form.xuiPassword;
        if (form.inboundId) updates.inboundId = form.inboundId;
        if (form.realityPort) updates.realityPort = form.realityPort;
        if (form.realityDest) updates.realityDest = form.realityDest;
        if (form.realitySni) updates.realitySni = form.realitySni;
        updates.realityPublicKey = form.realityPublicKey || null;
        updates.realityShortId = form.realityShortId || null;

        await api.updateServer(editingId, updates);
      } else {
        await api.createServer({ ...form });
      }
      setShowModal(false);
      loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save server");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleActive(server: ServerListItem) {
    setActionLoading(true);
    try {
      await api.updateServer(server.id, { isActive: !server.isActive });
      loadServers();
    } catch (err) {
      console.error("Failed to update server:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(server: ServerListItem) {
    if (!confirm(`Delete server "${server.name}"? This cannot be undone.`)) return;

    setActionLoading(true);
    try {
      await api.deleteServer(server.id);
      loadServers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete server");
    } finally {
      setActionLoading(false);
    }
  }

  async function openConnectionsModal(server: ServerListItem) {
    setConnectionsModal({ server, connections: [], loading: true });
    try {
      const response = await api.getServerConnections(server.id);
      if (response.success && response.data) {
        setConnectionsModal({ server, connections: response.data, loading: false });
      }
    } catch (err) {
      console.error("Failed to load connections:", err);
      setConnectionsModal((prev) => prev ? { ...prev, loading: false } : null);
    }
  }

  function formatBytes(bytes: string): string {
    const b = BigInt(bytes);
    if (b < 1024n) return `${b} B`;
    if (b < 1024n * 1024n) return `${(Number(b) / 1024).toFixed(1)} KB`;
    if (b < 1024n * 1024n * 1024n) return `${(Number(b) / 1024 / 1024).toFixed(1)} MB`;
    return `${(Number(b) / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${diffDay}d ago`;
  }

  function getUserDisplay(user: ConnectionInfo["user"]): string {
    if (user.firstName) return user.firstName;
    if (user.username) return `@${user.username}`;
    return user.telegramId;
  }

  async function handleDeleteConnection(connectionId: number) {
    if (!confirm("Delete this connection? This will remove the user's access to this server.")) return;

    try {
      await api.deleteConnection(connectionId);
      // Refresh connections list
      if (connectionsModal) {
        setConnectionsModal({
          ...connectionsModal,
          connections: connectionsModal.connections.filter((c) => c.id !== connectionId),
        });
        // Also refresh servers list to update count
        loadServers();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete connection");
    }
  }

  async function handleSyncTraffic() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await api.syncTraffic();
      if (response.success && response.data) {
        setSyncResult({
          connectionsUpdated: response.data.connectionsUpdated,
          serversProcessed: response.data.serversProcessed,
        });
        // Clear result after 5 seconds
        setTimeout(() => setSyncResult(null), 5000);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to sync traffic");
    } finally {
      setSyncing(false);
    }
  }

  const columns = [
    {
      key: "id",
      header: "ID",
      render: (server: ServerListItem) => <span className="text-gray-500">#{server.id}</span>,
    },
    {
      key: "name",
      header: "Server",
      render: (server: ServerListItem) => (
        <div>
          <div className="font-medium">
            {server.flagEmoji} {server.name}
          </div>
          <div className="text-sm text-gray-500">{server.location}</div>
        </div>
      ),
    },
    {
      key: "domain",
      header: "Domain",
      render: (server: ServerListItem) => (
        <div className="text-sm">
          <div className="font-mono">{server.domain}</div>
          <div className="text-gray-500">{server.host}</div>
        </div>
      ),
    },
    {
      key: "connections",
      header: "Connections",
      render: (server: ServerListItem) => (
        <button
          onClick={() => openConnectionsModal(server)}
          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 cursor-pointer"
        >
          {server.connectionCount} connections
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (server: ServerListItem) => (
        <span
          className={`px-2 py-1 text-xs rounded ${
            server.isActive
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {server.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (server: ServerListItem) => (
        <div className="flex gap-2">
          <button
            onClick={() => openEditModal(server)}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Edit
          </button>
          <button
            onClick={() => handleToggleActive(server)}
            disabled={actionLoading}
            className={`px-2 py-1 text-xs rounded ${
              server.isActive
                ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {server.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => handleDelete(server)}
            disabled={actionLoading || server.connectionCount > 0}
            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold">Servers</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3">
          {syncResult && (
            <span className="text-xs md:text-sm text-green-600 text-center sm:text-left">
              Synced {syncResult.connectionsUpdated} connections from {syncResult.serversProcessed} servers
            </span>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSyncTraffic}
              disabled={syncing}
              className="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm md:text-base"
            >
              {syncing ? "Syncing..." : "Sync Traffic"}
            </button>
            <button
              onClick={openCreateModal}
              className="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm md:text-base"
            >
              Add Server
            </button>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={servers}
        loading={loading}
        emptyMessage="No servers found"
        pagination={{
          page,
          totalPages,
          onPageChange: setPage,
        }}
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Edit Server" : "Add Server"}
      >
        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Germany 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location *
              </label>
              <input
                type="text"
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Frankfurt"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Flag Emoji
              </label>
              <input
                type="text"
                value={form.flagEmoji}
                onChange={(e) => setForm({ ...form, flagEmoji: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="🇩🇪"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Host IP *
              </label>
              <input
                type="text"
                required={!editingId}
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="123.45.67.89"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain {!editingId && "*"}
            </label>
            <input
              type="text"
              required={!editingId}
              disabled={!!editingId}
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="de1.example.com"
            />
            {editingId && (
              <p className="text-xs text-gray-500 mt-1">Domain cannot be changed after creation</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                XUI Port
              </label>
              <input
                type="number"
                value={form.xuiPort}
                onChange={(e) => setForm({ ...form, xuiPort: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                XUI Base Path
              </label>
              <input
                type="text"
                value={form.xuiBasePath}
                onChange={(e) => setForm({ ...form, xuiBasePath: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="/panel"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                XUI Username {!editingId && "*"}
              </label>
              <input
                type="text"
                required={!editingId}
                value={form.xuiUsername}
                onChange={(e) => setForm({ ...form, xuiUsername: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                XUI Password {!editingId && "*"}
              </label>
              <input
                type="password"
                required={!editingId}
                value={form.xuiPassword}
                onChange={(e) => setForm({ ...form, xuiPassword: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder={editingId ? "(leave blank to keep current)" : ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inbound ID
              </label>
              <input
                type="number"
                value={form.inboundId}
                onChange={(e) => setForm({ ...form, inboundId: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reality Port
              </label>
              <input
                type="number"
                value={form.realityPort}
                onChange={(e) => setForm({ ...form, realityPort: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reality Dest {!editingId && "*"}
              </label>
              <input
                type="text"
                required={!editingId}
                value={form.realityDest}
                onChange={(e) => setForm({ ...form, realityDest: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="www.google.com:443"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reality SNI {!editingId && "*"}
              </label>
              <input
                type="text"
                required={!editingId}
                value={form.realitySni}
                onChange={(e) => setForm({ ...form, realitySni: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="www.google.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reality Public Key
              </label>
              <input
                type="text"
                value={form.realityPublicKey}
                onChange={(e) => setForm({ ...form, realityPublicKey: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reality Short ID
              </label>
              <input
                type="text"
                value={form.realityShortId}
                onChange={(e) => setForm({ ...form, realityShortId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!connectionsModal}
        onClose={() => setConnectionsModal(null)}
        title={connectionsModal ? `Connections - ${connectionsModal.server.name}` : "Connections"}
      >
        {connectionsModal?.loading ? (
          <div className="py-8 text-center text-gray-500">Loading connections...</div>
        ) : connectionsModal?.connections.length === 0 ? (
          <div className="py-8 text-center text-gray-500">No connections found</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">User</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">XUI Email</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Up</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Down</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Last Sync</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {connectionsModal?.connections.map((conn) => (
                  <tr key={conn.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{getUserDisplay(conn.user)}</div>
                      {conn.user.username && conn.user.firstName && (
                        <div className="text-xs text-gray-500">@{conn.user.username}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                        {conn.xuiClientEmail}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {formatBytes(conn.trafficUp)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {formatBytes(conn.trafficDown)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          conn.subscription.status === "active"
                            ? "bg-green-100 text-green-700"
                            : conn.subscription.status === "expired"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {conn.subscription.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {formatRelativeTime(conn.lastSyncedAt)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleDeleteConnection(conn.id)}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
