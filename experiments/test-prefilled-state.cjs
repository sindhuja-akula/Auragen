const WebSocket = require('ws');

async function testPrefilledState() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

  let id = 1;
  const send = (method, params = {}) =>
    new Promise(r => {
      ws.send(JSON.stringify({ id: id++, method, params }));
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id - 1) {
          ws.off('message', handler);
          r(msg.result);
        }
      };
      ws.on('message', handler);
    });

  ws.on('open', async () => {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await new Promise(r => setTimeout(r, 1200));

    // Type prefilled values
    await send('Runtime.evaluate', {
      expression: `
        const input = document.querySelector('#email');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'sindhuja@');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      `,
    });

    await new Promise(r => setTimeout(r, 300));

    // Trigger friction on email
    await send('Runtime.evaluate', {
      expression: `window.__auragen?.simulateStruggle('email');`,
    });

    // Wait for in-place adaptation
    await new Promise(r => setTimeout(r, 2200));

    const res = await send('Runtime.evaluate', {
      expression: `({
        emailValue: document.querySelector('#field-group-email input')?.value,
        nameValue: document.querySelector('#name')?.value,
        phoneValue: document.querySelector('#phone')?.value,
        accountTypeValue: document.querySelector('#accountType')?.value,
        isAdapted: !!document.querySelector('#field-group-email .adaptive-field-wrapper.adapted')
      })`,
      returnByValue: true,
    });

    console.log('Preserved State Verification:', res.result.value);
    ws.close();
    process.exit(0);
  });
}

testPrefilledState().catch(console.error);
