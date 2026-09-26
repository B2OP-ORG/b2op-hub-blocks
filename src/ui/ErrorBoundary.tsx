import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 32,
        background: "#06090b",
        color: "#dff5fb",
        fontFamily: "monospace",
        gap: 16,
      }}>
        <h2 style={{ margin: 0, color: "#ffb0b0" }}>Something went wrong</h2>
        <pre style={{
          background: "#111a20",
          border: "1px solid #164e63",
          borderRadius: 8,
          padding: "12px 16px",
          maxWidth: 700,
          overflowX: "auto",
          fontSize: 12,
          color: "#ffb0b0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {error.message}
          {error.stack ? "\n\n" + error.stack : ""}
        </pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          style={{
            padding: "8px 20px",
            background: "#0e7490",
            color: "#fff",
            border: "1px solid #155e75",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
