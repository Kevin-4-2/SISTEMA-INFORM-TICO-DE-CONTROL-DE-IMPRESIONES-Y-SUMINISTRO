import { execSync } from 'child_process';

const PORT = process.env.PORT || 3001;

try {
  const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
  const lines = out.trim().split('\n').filter(l => l.includes('LISTENING'));
  const pids = [...new Set(lines.map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
  if (pids.length === 0) {
    console.log(`No hay proceso escuchando en el puerto ${PORT}.`);
    process.exit(0);
  }
  for (const pid of pids) {
    execSync(`taskkill /PID ${pid} /F`);
    console.log(`Proceso ${pid} detenido (puerto ${PORT}).`);
  }
} catch {
  console.log(`No hay proceso escuchando en el puerto ${PORT}.`);
}
