/**
 * /demo/app — public auto-launch route
 *
 * Automatically calls demo-login, sets the demo JWT + org in localStorage,
 * and hard-redirects to the dashboard.  No button click required.
 * Safe to share as a direct "open demo" URL.
 */
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import carmetechLogo from "@assets/Carme_Tech_Logo_Official_1779981155506.png";

const CONSULTATION_HREF =
  "mailto:info@carmetechnology.com?subject=Control%20HUB%20Consultation%20Request";

export default function DemoApp() {
  const [status, setStatus] = useState<"loading" | "error" | "unavailable">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function launch() {
      try {
        const res = await fetch("/api/auth/demo-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 503) {
            setStatus("unavailable");
            setErrorMsg(body.error ?? "The demo environment is temporarily unavailable.");
          } else {
            setStatus("error");
            setErrorMsg(body.error ?? "Demo login failed. Please try again.");
          }
          return;
        }

        const data = await res.json();
        // Clear any stale session data before writing the new demo session
        localStorage.removeItem("cmmc_active_org_id");
        localStorage.setItem("auth_token", data.token);
        if (data.demoOrgId) localStorage.setItem("cmmc_active_org_id", data.demoOrgId);
        localStorage.setItem("isDemoMode", "true");

        // Full page reload so AuthProvider picks up the new token fresh
        window.location.href = "/";
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg("Could not connect to the server. Please try again.");
        }
      }
    }

    launch();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "#0F172A" }}
    >
      {/* branding */}
      <div className="flex items-center gap-3 mb-10">
        <img src="/assets/control-hub-icon.png" alt="Control HUB" className="h-9 w-9 rounded-lg" />
        <span className="text-xl font-black text-white tracking-tight">Control HUB</span>
        <span className="text-slate-600">·</span>
        <img
          src={carmetechLogo}
          alt="Carme Technology"
          className="h-8 rounded"
          style={{ background: "#1C1A0A" }}
        />
      </div>

      {status === "loading" && (
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full mb-4"
            style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.25)" }}>
            <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-white font-semibold mb-1">Launching demo…</p>
          <p className="text-slate-500 text-sm">Preparing the CarmeTechnology demo environment</p>
        </div>
      )}

      {status === "unavailable" && (
        <div className="text-center max-w-md px-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full mb-4"
            style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}>
            <Shield className="h-6 w-6 text-yellow-400" />
          </div>
          <p className="text-white font-semibold mb-2">Demo data is being prepared</p>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Please check back shortly or contact{" "}
            <a href="mailto:info@carmetechnology.com" className="text-blue-400 hover:underline">
              info@carmetechnology.com
            </a>
          </p>
          <a
            href={CONSULTATION_HREF}
            className="inline-flex items-center gap-2 px-5 h-10 rounded-md text-sm font-medium"
            style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
          >
            Request Consultation
          </a>
        </div>
      )}

      {status === "error" && (
        <div className="text-center max-w-md px-6">
          <p className="text-white font-semibold mb-2">Something went wrong</p>
          <p className="text-slate-400 text-sm mb-6">{errorMsg}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 h-10 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
            <a
              href="/demo"
              className="inline-flex items-center h-10 px-5 rounded-md text-sm font-medium text-slate-300 hover:text-white transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            >
              Back to demo
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
