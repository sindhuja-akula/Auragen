if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = { env: {} };
}

import { createRoot } from 'react-dom/client';
import { AdaptiveForm } from './AdaptiveForm.js';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(<AdaptiveForm />);