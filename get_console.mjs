async function main() {
  const jsonResp = await fetch('http://127.0.0.1:9222/json');
  const pages = await jsonResp.json();
  const page = pages.find(p => p.url.includes('8080'));
  if (!page) {
    console.log('No 8080 page found.');
    return;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
    setTimeout(() => {
      ws.send(JSON.stringify({
        id: 10,
        method: 'Runtime.evaluate',
        params: { expression: 'document.documentElement.outerHTML' }
      }));
    }, 1500);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === 10) {
      console.log('PAGE HTML:', msg.result?.result?.value);
      process.exit(0);
    }
  };

  setTimeout(() => {
    console.log('Timeout');
    process.exit(1);
  }, 4000);
}

main().catch(console.error);
