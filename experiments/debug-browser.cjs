const WebSocket = require('ws');

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.type === 'page');
  if (!pageTab) {
    console.error('No page tab found');
    return;
  }
  console.log('Attaching to tab:', pageTab.title, pageTab.url);
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
    console.log('Connected to CDP');
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Console.enable');
    await send('Page.navigate', { url: 'http://localhost:5173/' });
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('EXCEPTION:', JSON.stringify(msg.params.exceptionDetails, null, 2));
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('CONSOLE:', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    } else if (msg.method === 'Console.messageAdded') {
      console.log('CONSOLE MSG:', msg.params.message.level, msg.params.message.text);
    } else if (msg.method === 'Page.loadEventFired') {
      console.log('Load event fired');
      setTimeout(async () => {
        const evalRes = await send('Runtime.evaluate', { expression: 'document.getElementById("root")?.innerHTML' });
        console.log('ROOT INNER HTML:\n', evalRes?.result?.value);
        const bodyRes = await send('Runtime.evaluate', { expression: 'document.body?.innerHTML' });
        console.log('BODY INNER HTML:\n', bodyRes?.result?.value);
        process.exit(0);
      }, 1500);
    }
  });
}

main().catch(console.error);
setTimeout(() => {
  console.log('Debug timeout');
  process.exit(1);
}, 10000);
