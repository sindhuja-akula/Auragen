const WebSocket = require('ws');

async function testBrowserInteraction() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.on('open', async () => {
    console.log('[Test] Connected to CDP');
    await send('Runtime.enable');
    await send('Page.enable');

    // Click the "Repeated Clicks" simulation button
    console.log('[Test] Clicking Repeated Clicks (x3) button...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('.btn-sim'));
        const clickBtn = btns.find(b => b.textContent.includes('Repeated Clicks'));
        clickBtn?.click();
      `,
    });

    await new Promise(r => setTimeout(r, 600));

    // Click the "Hesitation" simulation button to cross the 0.70 threshold!
    console.log('[Test] Clicking Hesitation (8.5s) button to cross 0.70 threshold...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('.btn-sim'));
        const hesBtn = btns.find(b => b.textContent.includes('Hesitation'));
        hesBtn?.click();
      `,
    });

    // Wait for WebSocket response & score update
    await new Promise(r => setTimeout(r, 1200));

    const scoreRes = await send('Runtime.evaluate', {
      expression: `document.querySelector('.score-value')?.textContent`,
    });
    console.log('[Test] Observed Score in UI:', scoreRes?.result?.value);

    const stageRes = await send('Runtime.evaluate', {
      expression: `document.querySelector('.step-item.current .step-label')?.textContent`,
    });
    console.log('[Test] Observed Pipeline Stage in UI:', stageRes?.result?.value);

    const signalsRes = await send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('.signal-tag.active')).map(e => e.textContent.trim())`,
    });
    console.log('[Test] Observed Active Signals in UI:', signalsRes?.result?.value);

    ws.close();
    process.exit(0);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  });
}

testBrowserInteraction().catch(console.error);
setTimeout(() => process.exit(1), 8000);
