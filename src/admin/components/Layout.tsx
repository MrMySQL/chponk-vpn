import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api";

const navItems = [
  { path: "/", label: "Dashboard", icon: "📊" },
  { path: "/users", label: "Users", icon: "👥" },
  { path: "/subscriptions", label: "Subscriptions", icon: "📋" },
  { path: "/servers", label: "Servers", icon: "🖥️" },
  { path: "/plans", label: "Plans", icon: "📦" },
  { path: "/payments", label: "Payments", icon: "💰" },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">VPN Admin</h1>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? "bg-gray-800 text-white border-r-2 border-blue-500"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => api.logout()}
            className="w-full px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
