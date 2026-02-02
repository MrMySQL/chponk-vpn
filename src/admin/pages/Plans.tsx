import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

interface Plan {
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
}

interface PlanForm {
  name: string;
  durationDays: number;
  priceStars: number;
  priceTon: string;
  trafficLimitGb: string;
  maxDevices: number;
}

const emptyForm: PlanForm = {
  name: "",
  durationDays: 30,
  priceStars: 100,
  priceTon: "1.0",
  trafficLimitGb: "",
  maxDevices: 3,
};

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [page]);

  async function loadPlans() {
    try {
      setLoading(true);
      const response = await api.getPlans({ page });
      if (response.success && response.data) {
        setPlans(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.totalPages);
        }
      }
    } catch (err) {
      console.error("Failed to load plans:", err);
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

  function openEditModal(plan: Plan) {
    setForm({
      name: plan.name,
      durationDays: plan.durationDays,
      priceStars: plan.priceStars,
      priceTon: plan.priceTon,
      trafficLimitGb: plan.trafficLimitGb?.toString() || "",
      maxDevices: plan.maxDevices,
    });
    setEditingId(plan.id);
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    try {
      const data = {
        name: form.name,
        durationDays: form.durationDays,
        priceStars: form.priceStars,
        priceTon: form.priceTon,
        trafficLimitGb: form.trafficLimitGb ? parseInt(form.trafficLimitGb) : null,
        maxDevices: form.maxDevices,
      };

      if (editingId) {
        await api.updatePlan(editingId, data);
      } else {
        await api.createPlan(data);
      }
      setShowModal(false);
      loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleActive(plan: Plan) {
    setActionLoading(true);
    try {
      await api.updatePlan(plan.id, { isActive: !plan.isActive });
      loadPlans();
    } catch (err) {
      console.error("Failed to update plan:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(plan: Plan) {
    if (!confirm(`Delete plan "${plan.name}"?`)) return;

    setActionLoading(true);
    try {
      await api.deletePlan(plan.id);
      loadPlans();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete plan");
    } finally {
      setActionLoading(false);
    }
  }

  const columns = [
    {
      key: "id",
      header: "ID",
      render: (plan: Plan) => <span className="text-gray-500">#{plan.id}</span>,
    },
    {
      key: "name",
      header: "Plan",
      render: (plan: Plan) => (
        <div>
          <div className="font-medium">{plan.name}</div>
          <div className="text-sm text-gray-500">{plan.durationDays} days</div>
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      render: (plan: Plan) => (
        <div className="text-sm">
          <div>⭐ {plan.priceStars} Stars</div>
          <div>💎 {plan.priceTon} TON</div>
        </div>
      ),
    },
    {
      key: "limits",
      header: "Limits",
      render: (plan: Plan) => (
        <div className="text-sm">
          <div>{plan.trafficLimitGb ? `${plan.trafficLimitGb} GB` : "Unlimited"}</div>
          <div>{plan.maxDevices} devices</div>
        </div>
      ),
    },
    {
      key: "subscriptions",
      header: "Active Subs",
      render: (plan: Plan) => (
        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
          {plan.activeSubscriptions}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (plan: Plan) => (
        <span
          className={`px-2 py-1 text-xs rounded ${
            plan.isActive
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {plan.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (plan: Plan) => (
        <div className="flex gap-2">
          <button
            onClick={() => openEditModal(plan)}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Edit
          </button>
          <button
            onClick={() => handleToggleActive(plan)}
            disabled={actionLoading}
            className={`px-2 py-1 text-xs rounded ${
              plan.isActive
                ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {plan.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => handleDelete(plan)}
            disabled={actionLoading}
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
        <h1 className="text-2xl font-bold">Plans</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Plan
        </button>
      </div>

      <DataTable
        columns={columns}
        data={plans}
        loading={loading}
        emptyMessage="No plans found"
        pagination={{
          page,
          totalPages,
          onPageChange: setPage,
        }}
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Edit Plan" : "Add Plan"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

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
              placeholder="Monthly Premium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (days) *
              </label>
              <input
                type="number"
                required
                min="1"
                value={form.durationDays}
                onChange={(e) => setForm({ ...form, durationDays: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Devices
              </label>
              <input
                type="number"
                min="1"
                value={form.maxDevices}
                onChange={(e) => setForm({ ...form, maxDevices: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (Stars) *
              </label>
              <input
                type="number"
                required
                min="0"
                value={form.priceStars}
                onChange={(e) => setForm({ ...form, priceStars: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (TON) *
              </label>
              <input
                type="text"
                required
                value={form.priceTon}
                onChange={(e) => setForm({ ...form, priceTon: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="1.5"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Traffic Limit (GB)
            </label>
            <input
              type="number"
              min="1"
              value={form.trafficLimitGb}
              onChange={(e) => setForm({ ...form, trafficLimitGb: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Leave empty for unlimited"
            />
            <p className="text-sm text-gray-500 mt-1">Leave empty for unlimited traffic</p>
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
    </div>
  );
}
