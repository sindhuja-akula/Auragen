export type StateValue = 'idle' | 'collecting' | 'adapting' | 'validating' | 'ready';

export class StateMachine {
  state: StateValue = 'idle';

  transition(next: StateValue) {
    this.state = next;
    return this.state;
  }
}
