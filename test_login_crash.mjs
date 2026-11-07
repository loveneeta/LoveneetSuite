async function main() {
  const loginRes = await fetch('http://localhost:8080/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPassword123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  const jsonResp = await fetch('http://127.0.0.1:9222/json');
  const pages = await jsonResp.json();
  const page = pages.find(p => p.url.includes('8080'));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));

    ws.send(JSON.stringify({
      id: 3,
      method: 'Runtime.evaluate',
      params: { expression: `localStorage.setItem('loveneet_token', '${token}'); location.reload();` }
    }));

    setTimeout(() => {
      ws.send(JSON.stringify({
        id: 20,
        method: 'Runtime.evaluate',
        params: { expression: 'document.querySelector(".section-head h2")?.textContent || document.querySelector("h2")?.textContent' }
      }));
    }, 2000);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === 20) {
      console.log('DASHBOARD HEADING:', msg.result?.result?.value);
      process.exit(0);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log('CRASH EXCEPTION:', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    }
  };

  setTimeout(() => {
    console.log('Timeout');
    process.exit(1);
  }, 5000);
}

main().catch(console.error);
