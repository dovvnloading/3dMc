import React from "react";

interface State {
  failed: boolean;
  message: string;
}

/** Preserve actionable error UI if React renders but the workspace crashes. */
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { failed: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error.message || "Unknown startup error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("3dMc editor startup failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return <main role="alert" style={{
      minHeight: "100dvh", background: "#141619", color: "#f0f2f6",
      padding: "max(8vh, 32px) 24px", fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{ maxWidth: 620, margin: "0 auto", lineHeight: 1.65 }}>
        <p style={{ color: "#80dbbf", letterSpacing: 1.8, fontSize: 12 }}>3dMc STUDIO</p>
        <h1 style={{ fontSize: 28, margin: "12px 0" }}>The editor couldn't start</h1>
        <p style={{ color: "#b8c0cd" }}>Your project file hasn't been modified by this screen. Reload the page to retry. If it keeps happening, include the error below in a GitHub issue.</p>
        <pre style={{
          border: "1px solid #3b4753", background: "#1c232a", borderRadius: 8,
          padding: 14, overflowWrap: "anywhere", whiteSpace: "pre-wrap", fontSize: 12
        }}>{this.state.message}</pre>
        <button type="button" onClick={() => window.location.reload()} style={{
          background: "#80dbbf", color: "#10251f", border: "none", borderRadius: 7,
          padding: "11px 17px", fontWeight: 700, cursor: "pointer"
        }}>Reload editor</button>
        <p><a href="https://github.com/dovvnloading/3dMc/issues" style={{ color: "#80dbbf" }}>Report a loading problem</a></p>
      </div>
    </main>;
  }
}
