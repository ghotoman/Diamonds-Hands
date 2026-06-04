import { Component, type ReactNode } from "react";
import { Logo } from "./Logo";
import { Button } from "./Button";

/// App-level error boundary. A render crash shows an on-brand fallback
/// (instead of a blank screen) and lets the user reload. Funds are on-chain,
/// so a UI crash never risks them — the copy says so.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("Diamond Hands crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="dh-phone font-sans">
          <div className="flex-1 grid place-items-center px-8 text-center">
            <div>
              <div className="mx-auto mb-5 grid place-items-center">
                <Logo size={56} />
              </div>
              <h1 className="text-[22px] font-bold text-ink leading-tight">Something broke</h1>
              <p className="mt-2 text-[14px] text-sub leading-relaxed text-balance">
                The app hit an unexpected error. Reloading usually fixes it — your funds stay safe on-chain.
              </p>
              <Button className="mt-6" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
