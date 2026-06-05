import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = 5173;
const url = `http://localhost:${port}`;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(1000);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
  });
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port);
  });
}

async function terminateProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const execSync = (await import('child_process')).execSync;
      let output = "";
      try {
        output = execSync(`netstat -ano`).toString();
      } catch (e) {}
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') {
            console.log(`Killing Windows process ${pid} on port ${port}...`);
            try {
              execSync(`taskkill /pid ${pid} /f /t`);
            } catch (e) {}
          }
        }
      }
    }
  } catch (err) {
    console.error(`Failed to clear port ${port}:`, err);
  }
}

async function run() {
  console.log(`Checking port ${port} availability...`);
  const available = await isPortAvailable(port);
  if (!available) {
    console.warn(`Port ${port} is currently in use. Attempting to clear it...`);
    await terminateProcessOnPort(port);
    await delay(1000);
  }

  console.log('Starting Vite server...');
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx.cmd' : 'npx';
  const viteProcess = spawn(cmd, ['vite', '--port', String(port), '--strictPort'], {
    shell: isWin,
    stdio: 'pipe'
  });

  console.log(`Waiting for server on port ${port}...`);
  let started = false;
  for (let i = 0; i < 50; i++) {
    if (await isPortOpen(port)) {
      started = true;
      break;
    }
    await delay(300);
  }

  if (!started) {
    console.error('Failed to start Vite server.');
    viteProcess.kill('SIGKILL');
    process.exit(1);
  }
  console.log('Vite server started successfully.');

  let browser;
  try {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
    ];
    let executablePath = undefined;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }

    console.log('Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 375, height: 812 });

    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#menu-screen.active', { timeout: 10000 });

    console.log('Clicking Settings Gear...');
    await page.waitForSelector('#btn-settings-gear', { visible: true });
    await page.click('#btn-settings-gear');
    await page.waitForSelector('#settings-screen.active', { timeout: 5000 });
    await delay(500);

    // Enable Touch HUD
    const touchBtn = await page.$('#btn-settings-touch');
    const touchText = await page.evaluate(el => el.innerText, touchBtn);
    if (touchText.includes('OFF')) {
      console.log('Toggling Touch HUD ON...');
      await page.click('#btn-settings-touch');
      await delay(500);
    }

    console.log('Closing Settings Menu...');
    await page.click('#btn-settings-close');
    await page.waitForSelector('#menu-screen.active', { timeout: 5000 });
    await delay(300);

    console.log('Opening Level Select...');
    await page.click('#btn-play-standard');
    await page.waitForSelector('#level-screen.active', { timeout: 5000 });
    await delay(500);

    console.log('Loading first level...');
    await page.click('.level-grid-container .level-item');
    await page.waitForSelector('#hud', { timeout: 15000 });
    
    // Wait for the 3D ship model to load
    await page.waitForFunction(() => {
      return window.gameManagerInstance &&
             window.gameManagerInstance.graphics &&
             window.gameManagerInstance.graphics.isObjLoaded;
    }, { timeout: 15000 });

    await delay(1000);

    // Check customizer button properties
    const info = await page.evaluate(() => {
      const el = document.getElementById('btn-touch-customize');
      if (!el) return { exists: false };
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const parentStyle = window.getComputedStyle(el.parentElement);
      const hudStyle = window.getComputedStyle(document.getElementById('mobile-touch-hud'));
      return {
        exists: true,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        parentPointerEvents: parentStyle.pointerEvents,
        hudPointerEvents: hudStyle.pointerEvents,
        hudClassList: document.getElementById('mobile-touch-hud').className,
        bodyWidth: document.body.clientWidth,
        bodyHeight: document.body.clientHeight
      };
    });

    console.log('Button info:', JSON.stringify(info, null, 2));

  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
    viteProcess.kill('SIGKILL');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', viteProcess.pid, '/f', '/t']);
    }
    console.log('Done.');
  }
}

run();
