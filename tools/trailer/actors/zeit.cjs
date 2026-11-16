// Spielzeit für Darsteller: läuft im Takt des Servers (/tick rate), nicht in echter Zeit.
//
// Beim Dreh läuft der Server in Zeitlupe (z. B. /tick rate 1.33 bei SLOW 15). Der echte Client zeigt dann alles 15-mal
// langsamer, das Video wird danach beschleunigt. Die Darsteller (mineflayer) müssen ihre Physik im selben Takt rechnen,
// sonst laufen sie im fertigen Video 15-mal zu schnell. mineflayer rechnet seine Physik mit performance.now() in
// Schritten von 50 ms – diese Uhr wird hier durch die Spielzeit ersetzt: Sie läuft mit tick_rate/20 der echten Zeit
// (und steht bei /tick freeze). Den Takt meldet der Server selbst (Paket „set_ticking_state“ bei jeder Änderung und
// beim Betreten) – nichts muss von Hand eingestellt werden.
//
// WICHTIG: vor mineflayer laden (require('./zeit.cjs') ganz oben), sonst merkt sich mineflayer die echte Uhr nicht –
// doch: mineflayer ruft performance.now() bei jedem Schritt neu auf, die Reihenfolge ist nur für die Klarheit.
'use strict';
const { performance } = require('perf_hooks');

const realNow = performance.now.bind(performance);
const state = { rate: 20, frozen: false, baseReal: realNow(), baseGame: realNow(), listeners: new Set() };

function gameNow() {
  if (state.frozen) return state.baseGame;
  return state.baseGame + (realNow() - state.baseReal) * (state.rate / 20);
}

function setRate(rate, frozen = false) {
  const g = gameNow();
  state.baseReal = realNow();
  state.baseGame = g;
  if (Number.isFinite(rate) && rate > 0) state.rate = rate;
  state.frozen = !!frozen;
  for (const fn of state.listeners) fn(state.rate, state.frozen);
}

// Ab hier misst mineflayer (und alles andere in diesem Prozess) in Spielzeit.
performance.now = gameNow;

/** Wartet ms Spielzeit (bei Zeitlupe entsprechend länger in echter Zeit). */
function wait(ms) {
  const until = gameNow() + ms;
  return new Promise((resolve) => {
    const step = () => {
      const left = until - gameNow();
      if (left <= 0) return resolve();
      const real = state.frozen ? 50 : Math.max(5, Math.min(250, left * 20 / state.rate));
      setTimeout(step, real);
    };
    step();
  });
}

/** Spielzeit in Sekunden → echte Sekunden beim jetzigen Takt. */
const realSeconds = (s) => s * 20 / state.rate;

/** An einen Bot hängen: Takt vom Server übernehmen. */
function follow(bot) {
  bot._client.on('set_ticking_state', (p) => setRate(p.tick_rate, p.is_frozen));
}

module.exports = { now: gameNow, realNow, wait, setRate, follow, realSeconds, state,
  onRate: (fn) => state.listeners.add(fn) };
