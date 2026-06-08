import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import carmetechLogo from "@assets/Carme_Tech_Logo_Official_1779981155506.png";

const CONSULTATION_HREF = "mailto:info@carmetechnology.com?subject=Control%20HUB%20Consultation%20Request";

export default function DemoVideo() {
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const syncingRef = useRef(false);

  const syncAudioToVideo = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || syncingRef.current) return;
    syncingRef.current = true;
    a.currentTime = v.currentTime;
    syncingRef.current = false;
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a) return;

    const onPlay = () => {
      a.currentTime = v.currentTime;
      a.play().catch(() => {});
    };
    const onPause = () => a.pause();
    const onSeeked = () => syncAudioToVideo();
    const onRateChange = () => { a.playbackRate = v.playbackRate; };
    const onVolumeChange = () => { a.muted = v.muted; };

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("ratechange", onRateChange);
    v.addEventListener("volumechange", onVolumeChange);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("ratechange", onRateChange);
      v.removeEventListener("volumechange", onVolumeChange);
    };
  }, [syncAudioToVideo]);

  const handleLaunchDemo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      localStorage.setItem("auth_token", data.token);
      if (data.demoOrgId) localStorage.setItem("cmmc_active_org_id", data.demoOrgId);
      localStorage.setItem("isDemoMode", "true");
      window.location.href = "/";
    } catch {
      /* silently fail */
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header style={{ background: "#0F172A", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/demo")}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-blue-600 flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-white">Control HUB</span>
            <span className="text-slate-600 text-xs">·</span>
            <img
              src={carmetechLogo}
              alt="Carme Technology"
              className="h-8 rounded"
              style={{ background: "#1C1A0A" }}
            />
          </div>
          <a
            href={CONSULTATION_HREF}
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
            style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
          >
            Request Consultation
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)" }} className="py-12">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#93C5FD" }}
          >
            Platform Walkthrough
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
            Control HUB Demo Walkthrough
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            See how defense contractors manage CMMC readiness from pre-assessment through evidence collection, monitoring, and reporting.
          </p>
        </div>
      </div>

      {/* ── Video ───────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {/* Hidden audio element — voiceover track */}
          <audio ref={audioRef} preload="auto">
            <source src="/videos/control-hub-demo-voiceover.mp3" type="audio/mpeg" />
          </audio>

          <video
            ref={videoRef}
            controls
            preload="metadata"
            poster="/videos/control-hub-demo-poster.png"
            className="w-full block"
            style={{ aspectRatio: "16/9", background: "#0F172A" }}
          >
            <source src="/videos/control-hub-demo-silent.mp4" type="video/mp4" />
            <track
              kind="captions"
              src="/videos/control-hub-demo-captions.vtt"
              srcLang="en"
              label="English"
              default
            />
            Your browser does not support the video tag.
          </video>

          {/* under-video action bar */}
          <div
            className="px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-3"
            style={{ background: "#0F172A", borderTop: "1px solid rgba(255,255,255,0.07)" }}
          >
            <span className="text-xs text-slate-500 hidden sm:block">
              Control HUB · CMMC 2.0 Platform Overview
            </span>
            <div className="flex gap-3">
              <Button
                onClick={handleLaunchDemo}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white border-0 font-semibold h-9 px-5 text-sm"
              >
                {isLoading ? "Launching…" : "Launch Live Demo"}
                {!isLoading && <ArrowRight className="h-4 w-4 ml-1.5" />}
              </Button>
              <a
                href={CONSULTATION_HREF}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium"
                style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
              >
                Request Consultation
              </a>
            </div>
          </div>
        </div>

      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        style={{ background: "#0F172A", borderTop: "1px solid rgba(255,255,255,0.06)" }}
        className="py-6 mt-4"
      >
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-blue-600 flex items-center justify-center">
              <Shield className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-bold text-white">Control HUB</span>
            <img
              src={carmetechLogo}
              alt="Carme Technology"
              className="h-7 rounded"
              style={{ background: "#1C1A0A" }}
            />
          </div>
          <div className="flex gap-4 text-xs text-slate-600">
            <button onClick={() => navigate("/demo")} className="hover:text-white transition-colors">
              Demo Overview
            </button>
            <a href={CONSULTATION_HREF} className="hover:text-white transition-colors">
              Consultation
            </a>
            <a href="mailto:info@carmetechnology.com" className="hover:text-white transition-colors">
              info@carmetechnology.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
