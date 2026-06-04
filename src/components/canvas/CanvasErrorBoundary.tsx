import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class CanvasErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex-1 flex flex-col items-center justify-center"
          style={{ background: 'var(--color-background)' }}
        >
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-text-muted)',
            }}
          >
            Something went wrong rendering the canvas.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: '12px',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--color-primary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
