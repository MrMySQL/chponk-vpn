import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

interface Server {
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
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ServerForm>(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function openEditModal(server: Server) {
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
    setEditingId(server.id);
    setError(null);
    setShowModal(true);
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
        if (form.flagEmoji) updates.flagEmoji = form.flagEmoji;
        if (form.host) updates.host = form.host;
        if (form.xuiPort) updates.xuiPort = form.xuiPort;
        if (form.xuiBasePath) updates.xuiBasePath = form.xuiBasePath;
        if (form.xuiUsername) updates.xuiUsername = form.xuiUsername;
        if (form.xuiPassword) updates.xuiPassword = form.xuiPassword;

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

  async function handleToggleActive(server: Server) {
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

  async function handleDelete(server: Server) {
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

  const columns = [
    {
      key: "id",
      header: "ID",
      render: (server: Server) => <span className="text-gray-500">#{server.id}</span>,
    },
    {
      key: "name",
      header: "Server",
      render: (server: Server) => (
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
      render: (server: Server) => (
        <div className="text-sm">
          <div className="font-mono">{server.domain}</div>
          <div className="text-gray-500">{server.host}</div>
        </div>
      ),
    },
    {
      key: "connections",
      header: "Connections",
      render: (server: Server) => (
        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
          {server.connectionCount} active
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (server: Server) => (
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
      render: (server: Server) => (
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Servers</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Server
        </button>
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
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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

          {!editingId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domain *
                </label>
                <input
                  type="text"
                  required
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="de1.example.com"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                    XUI Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.xuiUsername}
                    onChange={(e) => setForm({ ...form, xuiUsername: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    XUI Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={form.xuiPassword}
                    onChange={(e) => setForm({ ...form, xuiPassword: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reality Dest *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.realityDest}
                    onChange={(e) => setForm({ ...form, realityDest: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="www.google.com:443"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reality SNI *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.realitySni}
                    onChange={(e) => setForm({ ...form, realitySni: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="www.google.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
            </>
          )}

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
    </div>
  );
}
