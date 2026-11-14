/** Mini-RCON-Client: schickt Befehle nacheinander an einen Minecraft-Server und gibt die Antworten zurück. */
import net from 'node:net';

const TYPE_AUTH = 3;
const TYPE_COMMAND = 2;
const HEADER = 4;
const ID_AND_TYPE = 8;
const PADDING = 2;
const AUTH_FAILED = -1;
const TIMEOUT_MS = 30_000;
const PROGRESS_STEPS = 20;
// Fehlerantworten des Servers erkennen: passt auf "Unknown block type 'minecraft:foo'" oder
// "That position is not loaded", nicht auf "Successfully filled 12 block(s)".
// https://regex101.com/?flavor=javascript&flags=i&regex=%5E(Unknown%7CIncorrect%7CExpected%7CInvalid%7CCould%20not%7CThat%20position%7CCannot%7CError)&testString=That%20position%20is%20not%20loaded
const SERVER_ERROR = /^(Unknown|Incorrect|Expected|Invalid|Could not|That position|Cannot|Error)/i;

export class RconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RconError';
  }
}

function packet(id: number, type: number, body: string): Buffer {
  const text = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(HEADER + ID_AND_TYPE + text.length + PADDING);
  buf.writeInt32LE(ID_AND_TYPE + text.length + PADDING, 0);
  buf.writeInt32LE(id, HEADER);
  buf.writeInt32LE(type, HEADER + HEADER);
  text.copy(buf, HEADER + ID_AND_TYPE);
  return buf;
}

export class Rcon {
  private socket: net.Socket | null = null;
  private pending = Buffer.alloc(0);
  private waiters = new Map<number, (r: { id: number; body: string }) => void>();
  private nextId = 1;

  async connect(host: string, port: number, password: string): Promise<void> {
    this.socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection({ host, port }, () => resolve(s));
      s.once('error', reject);
    });
    this.socket.setTimeout(TIMEOUT_MS, () => this.socket?.destroy(new RconError('RCON antwortet nicht')));
    this.socket.on('data', (chunk) => this.read(chunk));
    const reply = await this.send(TYPE_AUTH, password);
    if (reply.id === AUTH_FAILED) throw new RconError('RCON: falsches Passwort');
  }

  private read(chunk: Buffer): void {
    this.pending = Buffer.concat([this.pending, chunk]);
    const drain = (): void => {
      if (this.pending.length < HEADER) return;
      const size = this.pending.readInt32LE(0);
      if (this.pending.length < HEADER + size) return;
      const id = this.pending.readInt32LE(HEADER);
      const body = this.pending.subarray(HEADER + ID_AND_TYPE, HEADER + size - PADDING).toString('utf8');
      this.pending = this.pending.subarray(HEADER + size);
      const waiter = this.waiters.get(id) ?? this.waiters.get(this.nextId - 1);
      if (waiter) {
        this.waiters.delete(id);
        waiter({ id, body });
      }
      drain();
    };
    drain();
  }

  private send(type: number, body: string): Promise<{ id: number; body: string }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new RconError('RCON nicht verbunden'));
      this.waiters.set(id, resolve);
      this.socket.write(packet(id, type, body));
    });
  }

  async command(cmd: string): Promise<string> {
    return (await this.send(TYPE_COMMAND, cmd)).body;
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
  }
}

/** Schickt viele Befehle; meldet Fortschritt und sammelt Fehlermeldungen des Servers. */
export async function runAll(
  rcon: Rcon,
  commands: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const errors: string[] = [];
  const every = Math.max(1, Math.floor(commands.length / PROGRESS_STEPS));
  await commands.reduce(async (prev, cmd, i) => {
    await prev;
    const answer = await rcon.command(cmd);
    if (SERVER_ERROR.test(answer)) errors.push(`${cmd} → ${answer}`);
    if (onProgress && i % every === 0) onProgress(i, commands.length);
  }, Promise.resolve());
  return errors;
}
