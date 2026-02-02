import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

declare global {
  interface Window {
    onTelegramAuth: (user: Record<string, string>) => void;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Redirect if already authenticated
    if (api.isAuthenticated()) {
      navigate("/", { replace: true });
      return;
    }

    // Set up Telegram auth callback
    window.onTelegramAuth = async (user) => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.login(user);
        if (response.success) {
          navigate("/", { replace: true });
        } else {
          setError(response.error || "Login failed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
      } finally {
        setLoading(false);
      }
    };

    // Load Telegram widget script
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", getBotUsername());
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;

    const container = document.getElementById("telegram-login-container");
    if (container) {
      container.innerHTML = "";
      container.appendChild(script);
    }
  }, [navigate]);

  function getBotUsername(): string {
    // This should match your bot's username
    // In production, this could come from an environment variable injected at build time
    return import.meta.env.VITE_BOT_USERNAME || "your_bot";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">VPN Admin Panel</h1>
          <p className="text-gray-600 mt-2">Sign in with your Telegram account</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-4">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            <p className="mt-2 text-gray-600">Authenticating...</p>
          </div>
        ) : (
          <div id="telegram-login-container" className="flex justify-center"></div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>Only administrators can access this panel.</p>
          <p className="mt-1">Contact support if you need access.</p>
        </div>
      </div>
    </div>
  );
}
