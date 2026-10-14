import { useEffect, useState } from "react";
import splashUrl from "../assets/s4-splash.jpeg";

const DURATION_MS = 2000;
const FADE_MS = 250;
// Landscape: the whole picture (contain). Portrait phones: zoomed so the logo + text (about 38 % of the picture
// width) span the screen width, the empty leather at the sides is cropped and the top / bottom edges fade into
// the blurred fill.
const SPLASH_CSS = `
.s4-splash-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
@media (orientation:portrait){.s4-splash-img{inset:auto;left:50%;top:50%;width:240vw;max-width:none;height:auto;transform:translate(-50%,-50%);
-webkit-mask-image:linear-gradient(to bottom,transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(to bottom,transparent,#000 14%,#000 86%,transparent)}}
`;

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
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, overflow: "hidden", background: "#1e1e2e",
          opacity: phase === "fading" ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}>
          {/* full screen on every device: the same picture, blurred, fills the screen behind the sharp one, which
              is shown whole (contain) so the logo and its text are never cut on a tall phone or a wide monitor */}
          <div style={{ position: "absolute", inset: -40, background: `url(${splashUrl}) center / cover no-repeat`, filter: "blur(24px) brightness(0.75)" }} />
          <style>{SPLASH_CSS}</style>
          <img className="s4-splash-img" src={splashUrl} alt="S4 Business Thinking" draggable={false} />
          <div role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
            style={{ position: "absolute", left: "50%", bottom: "max(24px, 4vh)", transform: "translateX(-50%)", width: "min(500px, 80vw)", height: 15,
              border: "1px solid #3d3d5c", borderRadius: 7, background: "#2e2e3e", overflow: "hidden" }}>
            <div style={{ width: `${percent}%`, height: "100%", background: "#55aaff", borderRadius: 7 }} />
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "Segoe UI, Arial, sans-serif" }}>
              {percent}%
            </span>
          </div>
        </div>
      )}
    </>
  );
}
