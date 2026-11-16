// Node-Module (mineflayer, vec3 …) finden: erst normal, dann aus MM_NODE_MODULES bzw. ~/mm-cache/node/node_modules
// bzw. /home/user/mm-cache/node/node_modules (dort liegen sie in der Sandbox – nicht im Repo).
'use strict';
const path = require('path');
const os = require('os');

function need(mod) {
  try {
    return require(mod);
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    const bases = [process.env.MM_NODE_MODULES, '/home/user/mm-cache/node/node_modules',
      path.join(os.homedir(), 'mm-cache/node/node_modules')].filter(Boolean);
    for (const base of bases) {
      try { return require(path.join(base, mod)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
    }
    throw err;
  }
}

module.exports = { need };
