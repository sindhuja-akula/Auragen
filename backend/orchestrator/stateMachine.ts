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
    this.state = next;
    return this.state;
  }

  reset(): StateValue {
    this.state = 'IDLE';
    return this.state;
  }
}
