import React from "react";

export default class S4BootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[S4] UI crash", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const bn = this.props.lang === "bn";
    const msg = String(error?.message || error || "Unknown error");

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#09090b",
          color: "#e4e4e7",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          padding: "24px 20px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8, color: "#f87171" }}>
            {bn ? "অ্যাপ লোড হয়নি" : "App failed to load"}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "#a1a1aa", marginBottom: 16 }}>
            {bn
              ? "আপডেটের পর সফটওয়্যার খুলতে সমস্যা হয়েছে। নিচের বোতামে রিলোড করুন। না হলে পুরনো ভার্সন (১.০.৬৭) ইন্সটল করুন বা মোবাইলে অ্যাপ ডেটা ক্লিয়ার করুন।"
              : "Something went wrong after the update. Try Reload below, reinstall v1.0.67, or clear app data on mobile."}
          </p>
          <pre
            style={{
              fontSize: 11,
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              padding: 12,
              overflow: "auto",
              maxHeight: 120,
              marginBottom: 20,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {bn ? "🔄 আবার চালু করুন" : "🔄 Reload"}
          </button>
        </div>
      </div>
    );
  }
}
