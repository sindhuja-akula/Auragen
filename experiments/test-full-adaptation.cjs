const WebSocket = require('ws');

async function testFullAdaptation() {
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
    console.log('[E2E Test] Connected to Chrome CDP');
    await send('Runtime.enable');

    console.log('[E2E Test] Clicking Repeated Clicks (x3)...');
    await send('Runtime.evaluate', {
      expression: `
        Array.from(document.querySelectorAll('.btn-sim'))
          .find(b => b.textContent.includes('Repeated Clicks'))?.click();
      `,
    });

    await new Promise(r => setTimeout(r, 400));

    console.log('[E2E Test] Clicking Hesitation (8.5s)...');
    await send('Runtime.evaluate', {
      expression: `
        Array.from(document.querySelectorAll('.btn-sim'))
          .find(b => b.textContent.includes('Hesitation'))?.click();
      `,
    });

    console.log('[E2E Test] Waiting for generation & adaptation (up to 10s)...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const res = await send('Runtime.evaluate', {
        expression: `({
          score: document.querySelector('.score-value')?.textContent,
          stage: document.querySelector('.step-item.current .step-label')?.textContent,
          hasDynamicContainer: !!document.querySelector('.auragen-dynamic-container'),
          formText: document.querySelector('.card-body')?.textContent?.slice(0, 100),
          inputValue: document.querySelector('input#name')?.value
        })`,
        returnByValue: true
      });
      const data = res?.result?.value;
      console.log(`[E2E Test +${(i+1)*0.5}s] Stage: ${data?.stage}, Score: ${data?.score}, Adapted: ${data?.hasDynamicContainer}, NameVal: ${data?.inputValue}`);
      if (data?.hasDynamicContainer) {
        console.log('[E2E Test] UI successfully adapted!');
        break;
      }
    }

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

testFullAdaptation().catch(console.error);
setTimeout(() => process.exit(1), 15000);
