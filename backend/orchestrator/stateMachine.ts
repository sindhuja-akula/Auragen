export type StateValue =
  | 'IDLE'
  | 'DETECTING'
  | 'ADAPTATION_REQUESTED'
  | 'GENERATING'
  | 'VALIDATING'
  | 'APPLYING'
  | 'COOLDOWN'
  | 'FAILED';

export class StateMachine {
  state: StateValue = 'IDLE';

  transition(next: StateValue): StateValue {
    const allowedTransitions: Record<StateValue, StateValue[]> = {
      IDLE: ['DETECTING'],
      DETECTING: ['IDLE', 'ADAPTATION_REQUESTED'],
      ADAPTATION_REQUESTED: ['GENERATING', 'FAILED'],
      GENERATING: ['VALIDATING', 'FAILED'],
      VALIDATING: ['APPLYING', 'FAILED'],
      APPLYING: ['COOLDOWN', 'FAILED'],
      COOLDOWN: ['IDLE'],
      FAILED: ['IDLE', 'DETECTING'],
    };

    if (next !== this.state && !allowedTransitions[this.state].includes(next)) {
      throw new Error(`Invalid state transition: ${this.state} -> ${next}`);
    }

    this.state = next;
    return this.state;
  }

  reset(): StateValue {
    this.state = 'IDLE';
    return this.state;
  }
}
