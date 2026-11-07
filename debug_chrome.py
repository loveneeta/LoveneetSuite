import subprocess, time, json, urllib.request

chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
proc = subprocess.Popen([
    chrome_path,
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    'http://localhost:8080'
])

try:
    time.sleep(2)
    resp = urllib.request.urlopen('http://127.0.0.1:9222/json')
    pages = json.loads(resp.read().decode('utf-8'))
    print("Remote pages:", pages)
finally:
    proc.kill()
