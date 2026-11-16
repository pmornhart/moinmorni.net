// Kleiner RCON-Client (für Drehbuch-Skripte in Node): const rc = await rcon('127.0.0.1:26210', pass); await rc('list')
'use strict';
const net = require('net');

function rcon(addr, password) {
  const [host, port] = addr.split(':');
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port: Number(port) });
    let buf = Buffer.alloc(0), id = 1;
    const waiting = new Map();
    const send = (kind, body) => {
      const b = Buffer.from(body, 'utf8');
      const p = Buffer.alloc(14 + b.length);
      p.writeInt32LE(10 + b.length, 0); p.writeInt32LE(++id, 4); p.writeInt32LE(kind, 8); b.copy(p, 12);
      s.write(p);
      return id;
    };
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 4) {
        const len = buf.readInt32LE(0);
        if (buf.length < len + 4) break;
        const rid = buf.readInt32LE(4), body = buf.slice(12, 4 + len - 2).toString('utf8');
        buf = buf.slice(4 + len);
        const w = waiting.get(rid);
        if (w) { waiting.delete(rid); w(body); }
        if (rid === -1) reject(new Error('RCON: falsches Passwort'));
      }
    });
    s.on('error', reject);
    s.on('connect', () => {
      const auth = send(3, password);
      waiting.set(auth, () => {
        const rc = (cmd) => new Promise((res) => waiting.set(send(2, cmd), (b) => res(b.replace(/§./g, ''))));
        rc.close = () => s.end();
        resolve(rc);
      });
    });
  });
}

module.exports = { rcon };
