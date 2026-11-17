/**
 * Befehlsbaum mit einem Test-Spieler über Velocity: je Befehl nur ein Name (deutscher Hauptname), Aliase gehen weiter.
 *   NODE_PATH=~/mm-cache/node/node_modules node befehle-test.cjs <host> <port>
 */
const mineflayer = require('mineflayer');

const [HOST = '127.0.0.1', PORT = '27200'] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};

(async () => {
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: `Befehle${Date.now() % 1000}`,
  });
  let names = [];
  bot._client.on('declare_commands', (p) => {
    const root = p.nodes[p.rootIndex];
    names = root.children.map((i) => p.nodes[i]?.extraNodeData?.name).filter(Boolean);
  });
  const chat = [];
  bot.on('message', (m) => chat.push(m.toString()));
  await new Promise((r) => bot.once('spawn', r));
  await wait(6000);
  console.log(`Befehlsbaum: ${names.length} Namen`);
  require('node:fs').writeFileSync(process.env.MM_TREE_OUT ?? '/dev/null', names.sort().join('\n'));
  for (const main of ['fliegen', 'rundgang', 'jnr', 'sprachchat', 'lobby', 'msg', 'freunde'])
    check(`/${main} im Baum`, names.includes(main));
  for (const alias of [
    'fly',
    'tour',
    'jumpandrun',
    'parkour',
    'voice',
    'hub',
    'friends',
    'tell',
    'mute',
    'warn',
  ])
    check(`/${alias} nicht im Baum`, !names.includes(alias));
  check('kein moinmorni:…', !names.some((n) => n.startsWith('moinmorni:')));
  for (const cmd of ['/fliegen', '/fly']) {
    chat.length = 0;
    bot.chat(cmd);
    await wait(2500);
    check(
      `${cmd} antwortet`,
      chat.some((l) => /VIP|Fliegen|Doppelsprung|fly/i.test(l)),
      chat.join(' | ').slice(0, 120),
    );
  }
  chat.length = 0;
  bot.chat('/voice');
  await wait(2500);
  check('/voice (Alias) antwortet', chat.length > 0, chat.join(' | ').slice(0, 120));
  bot.quit();
  const ok = results.filter(Boolean).length;
  console.log(`${ok}/${results.length}`);
  process.exit(ok === results.length ? 0 : 1);
})();
