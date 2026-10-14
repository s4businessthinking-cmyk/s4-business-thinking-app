import { useEffect, useState } from "react";
import splashUrl from "../assets/s4-splash.jpeg";

const DURATION_MS = 2000;
const FADE_MS = 250;

// Start-up loading screen: the S4 picture with a progress bar that runs 0-100 %, then fades out to the
// login page / app, which already mounts underneath so nothing loads later than before.
export default function S4SplashScreen({ children }) {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState("loading"); // loading -> fading -> done

  useEffect(() => {
    let frame = 0;
    let fadeTimer = 0;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(100, Math.round(((now - start) / DURATION_MS) * 100));
      setPercent(p);
      if (p < 100) { frame = requestAnimationFrame(tick); return; }
      setPhase("fading");
      fadeTimer = setTimeout(() => setPhase("done"), FADE_MS);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); clearTimeout(fadeTimer); };
  }, []);

  return (
    <>
      {children}
      {phase !== "done" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "#1e1e2e", display: "flex", alignItems: "center", justifyContent: "center",
          opacity: phase === "fading" ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}>
          <div style={{ width: "min(600px, 92vw)", borderRadius: 10, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.55)", background: "#1e1e2e" }}>
            {/* the picture keeps its own shape (1390 x 752) so the logo text is not cut or covered by the bar */}
            <img src={splashUrl} alt="S4 Business Thinking" draggable={false} style={{ display: "block", width: "100%", aspectRatio: "1390 / 752", objectFit: "cover" }} />
            <div style={{ padding: "14px 8.33%" }}>
            <div role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
              style={{ position: "relative", height: 15, border: "1px solid #3d3d5c", borderRadius: 7, background: "#2e2e3e", overflow: "hidden" }}>
              <div style={{ width: `${percent}%`, height: "100%", background: "#55aaff", borderRadius: 7 }} />
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "Segoe UI, Arial, sans-serif" }}>
                {percent}%
              </span>
            </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
