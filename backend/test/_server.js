import { spawn } from 'node:child_process';
import net from 'node:net';

let singletonServer = null;

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

export async function startTestServer() {
  if (singletonServer) {
    return singletonServer;
  }

  const host = '127.0.0.1';
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, host, () => {
      const selected = String(probe.address().port);
      probe.close(() => resolve(selected));
    });
  });
  const baseURL = `http://${host}:${port}`;

  const env = {
    ...process.env,
    PORT: port,
    NODE_ENV: 'development',
    SESSION_SECRET: 'qa-only-secret',
    DB_HOST: process.env.SICIS_QA_DB_HOST || '127.0.0.1',
    DB_PORT: process.env.SICIS_QA_DB_PORT || '5432',
    DB_NAME: process.env.SICIS_QA_DB_NAME || 'sicis_qa',
    DB_USER: process.env.SICIS_QA_DB_USER || 'sicisqa',
    DB_PASSWORD: process.env.SICIS_QA_DB_PASSWORD || 'sicisqa'
  };

  const child = spawn('node', ['index.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => (stdout += data.toString()));
  child.stderr.on('data', (data) => (stderr += data.toString()));

  child.on('error', (err) => {
    console.error('Server process error:', err);
  });

  child.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code}, signal ${signal}`);
    if (stderr) console.error('Server stderr:', stderr);
    singletonServer = null;
  });

  const healthURL = `${baseURL}/health`;
  let retries = 30;
  let connected = false;
  while (retries > 0 && !connected) {
    try {
      const response = await fetch(healthURL);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok' && data.database === 'connected') {
          // Verify the child process is still alive
          if (!isProcessAlive(child.pid)) {
            throw new Error(`Child process ${child.pid} is not alive`);
          }
          connected = true;
          break;
        }
      }
    } catch (err) {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    retries--;
  }

  if (!connected) {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (!child.killed) child.kill('SIGKILL');
    throw new Error(`Server failed to start. stdout: ${stdout}\nstderr: ${stderr}`);
  }

  console.log(`Test server started at ${baseURL}`);

  singletonServer = {
    baseURL,
    child,
    async fetch(path, options = {}) {
      const url = `${baseURL}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      return fetch(url, { ...options, headers });
    },
    async get(path, options = {}) {
      return this.fetch(path, { ...options, method: 'GET' });
    },
    async post(path, body, options = {}) {
      return this.fetch(path, { ...options, method: 'POST', body: JSON.stringify(body) });
    },
    async put(path, body, options = {}) {
      return this.fetch(path, { ...options, method: 'PUT', body: JSON.stringify(body) });
    },
    async delete(path, options = {}) {
      return this.fetch(path, { ...options, method: 'DELETE' });
    },
    async login(usuario, password) {
      const res = await this.post('/login', { usuario, password });
      const cookies = res.headers.get('set-cookie');
      return { response: res, cookie: cookies };
    },
    async stop() {
      return new Promise((resolve) => {
        if (child) {
          let timeoutHandle;
          const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            child.removeAllListeners('exit');
          };

          child.on('exit', (code, signal) => {
            cleanup();
            singletonServer = null;
            resolve();
          });

          child.kill('SIGTERM');

          timeoutHandle = setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 3000);
        } else {
          resolve();
        }
      });
    }
  };

  return singletonServer;
}

export async function stopTestServer() {
  if (singletonServer) {
    await singletonServer.stop();
    singletonServer = null;
  }
}

export function getBaseURL() {
  if (!singletonServer) {
    throw new Error('Test server not started. Call startTestServer() first.');
  }
  return singletonServer.baseURL;
}
