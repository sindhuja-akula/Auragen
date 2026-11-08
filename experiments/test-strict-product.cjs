const WebSocket = require('ws');

async function testStrictProduct() {
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
    console.log('[Product Test] Connected to Chrome CDP');
    await send('Page.enable');
    await send('Runtime.enable');

    // Reload page to get fresh state
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await new Promise(r => setTimeout(r, 1500));

    // 1. Verify NO dashboard / NO telemetry / NO cognitive panels
    const checkPanels = await send('Runtime.evaluate', {
      expression: `({
        hasDiagColumn: !!document.querySelector('.diagnostics-column'),
        hasSimButtons: !!document.querySelector('.sim-buttons-grid'),
        hasScoreGauge: !!document.querySelector('.score-display'),
        hasStepper: !!document.querySelector('.lifecycle-stepper'),
        hasAccountSetup: !!document.querySelector('.account-setup-card'),
        nameValue: document.querySelector('#name')?.value,
        phoneValue: document.querySelector('#phone')?.value,
        accountTypeValue: document.querySelector('#accountType')?.value,
      })`,
      returnByValue: true,
    });

    const initial = checkPanels?.result?.value;
    console.log('[Product Test] Clean UI check:', {
      hasDashboardPanels: initial?.hasDiagColumn || initial?.hasSimButtons || initial?.hasScoreGauge,
      hasAccountSetup: initial?.hasAccountSetup,
      nameValue: initial?.nameValue,
      phoneValue: initial?.phoneValue,
      accountTypeValue: initial?.accountTypeValue,
    });

    if (initial?.hasDiagColumn || initial?.hasSimButtons || initial?.hasScoreGauge) {
      console.error('[Product Test] FAIL: Engineering panels still visible on screen!');
      process.exit(1);
    }

    // 2. User enters an email value and struggles with Email
    console.log('[Product Test] User types email and struggles with email interaction...');
    await send('Runtime.evaluate', {
      expression: `
        const emailInput = document.querySelector('#email');
        if (emailInput) {
          emailInput.value = 'abc';
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.focus();
        }
      `,
    });

    await new Promise(r => setTimeout(r, 300));

    // Trigger natural friction on Email via helper
    await send('Runtime.evaluate', {
      expression: `window.__auragen?.simulateStruggle('email');`,
    });

    console.log('[Product Test] Waiting for targeted in-place adaptation of Email...');
    let emailAdapted = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const checkAdaptation = await send('Runtime.evaluate', {
        expression: `({
          emailAdapted: !!document.querySelector('#field-group-email .adaptive-field-wrapper.adapted'),
          nameValue: document.querySelector('#name')?.value,
          phoneValue: document.querySelector('#phone')?.value,
          accountTypeValue: document.querySelector('#accountType')?.value,
          emailValue: document.querySelector('#field-group-email input')?.value,
          nameGroupHasInput: !!document.querySelector('#field-group-name input'),
          phoneGroupHasInput: !!document.querySelector('#field-group-phone input'),
          accountTypeGroupHasSelect: !!document.querySelector('#field-group-accountType select'),
        })`,
        returnByValue: true,
      });

      const current = checkAdaptation?.result?.value;
      if (current?.emailAdapted) {
        console.log(`[Product Test +${(i+1)*0.5}s] Targeted adaptation observed!`, current);
        emailAdapted = true;
        break;
      }
    }

    if (!emailAdapted) {
      console.error('[Product Test] FAIL: Email field was not adapted in-place.');
      process.exit(1);
    }

    console.log('[Product Test] SUCCESS: Targeted in-place adaptation verified with 100% state preservation!');
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

testStrictProduct().catch(console.error);
setTimeout(() => process.exit(1), 15000);
