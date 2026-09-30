export type UIState = Record<string, unknown>;

export class StateManager {
  private state: UIState = {};

  setState(next: UIState) {
    this.state = { ...this.state, ...next };
  }

  getState() {
    return { ...this.state };
  }
}
