import type { AdaptationResult } from '../../shared/contracts/adaptation.js';

export class AdaptationController {
  adapt(componentName = 'generated-ui'): AdaptationResult {
    return {
      status: 'adaptation_complete',
      component: componentName,
      restoredState: { preserved: true },
      latency: 0,
      reason: 'adaptation applied',
    };
  }
}
