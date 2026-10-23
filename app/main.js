/* global GameBoyAdvanceAudio */
import { db } from './db.js';
import { extractFromZip } from './zip.js';
import { Machine } from './machine.js';
import { Runner } from './runner.js';
import { LinkCable } from './link.js';
import { TouchPad, Keyboard, pollGamepads } from './input.js';

const $ = (sel) => document.querySelector(sel);

// Label colours and names for the games this app is built around; anything
// else gets a colour derived from its cartridge code
const KNOWN = {
  BPR: { name: 'Pokémon FireRed', color: '#d9452f' },
  BPG: { name: 'Pokémon LeafGreen', color: '#3c9a4a' },
  AXV: { name: 'Pokémon Ruby', color: '#b51f3d' },
  AXP: { name: 'Pokémon Sapphire', color: '#2856b8' },
  BPE: { name: 'Pokémon Emerald', color: '#178a5c' },
};

const SPEEDS = [1, 2, 4];

let games = [];
let biosPromise = null;
let session = null;
let pendingSaveTarget = null;

// ---------- Helpers ----------

function toast(message, ms = 2600) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), ms);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child != null) node.append(child);
  }
  return node;
}

function gameColor(game) {
  const known = KNOWN[game.code?.slice(0, 3)];
  if (known) return known.color;
  let h = 0;
  for (const ch of game.code || game.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

function cleanName(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[([][^)\]]*[)\]]/g, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Jogo sem nome';
}

function timeAgo(ts) {
  if (!ts) return 'Nunca jogado';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'Jogado agora';
  if (min < 60) return `Jogado há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Jogado há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Jogado ontem' : `Jogado há ${d} dias`;
}

function cartridge(game) {
  return el('div', { class: 'cart', style: `--c:${gameColor(game)}` },
    el('div', { class: 'cart-label' },
      el('span', { class: 'cart-badge' }, 'GBA'),
      el('span', { class: 'cart-title' }, game.name)));
}

function readFile(file) {
  return file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer();
}

async function shareOrDownload(data, filename) {
  const file = new File([data], filename, { type: 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function getBios() {
  if (!biosPromise) {
    biosPromise = fetch('core/bios.bin').then((r) => {
      if (!r.ok) throw new Error('Não foi possível carregar a BIOS.');
      return r.arrayBuffer();
    });
  }
  return biosPromise;
}

// ---------- Sheets ----------

const sheet = $('#sheet');

// Shows a bottom sheet and resolves with the value of the chosen action
// (or null when dismissed)
function openSheet({ title, text = '', content = null, actions = [] }) {
  if (sheet.open) sheet.close('');
  $('#sheet-title').textContent = title;
  $('#sheet-text').textContent = text;
  const contentBox = $('#sheet-content');
  contentBox.replaceChildren(...(content ? [content] : []));
  const actionBox = $('#sheet-actions');
  actionBox.replaceChildren(...actions.map((a) => el('button', {
    class: `sheet-btn ${a.kind || ''}`,
    type: 'submit',
    value: a.value,
    disabled: a.disabled,
    'data-value': a.value,
  }, a.label)));
  actionBox.append(el('button', { class: 'sheet-btn cancel', type: 'submit', value: '' }, 'Cancelar'));

  return new Promise((resolve) => {
    sheet.returnValue = '';
    sheet.addEventListener('close', () => resolve(sheet.returnValue || null), { once: true });
    sheet.showModal();
  });
}

sheet.addEventListener('click', (e) => {
  // Tap on the backdrop closes the sheet
  if (e.target === sheet) sheet.close('');
});

function confirmSheet(title, text, label, kind = 'danger') {
  return openSheet({ title, text, actions: [{ label, value: 'yes', kind }] }).then((v) => v === 'yes');
}

// ---------- Library ----------

async function loadLibrary() {
  games = await db.listGames();
  games.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name));
  renderLibrary();
}

function renderLibrary() {
  const lib = $('#library');
  lib.replaceChildren(...games.map((game) => el('div', { class: 'game-cell' },
    el('button', { class: 'game', type: 'button', onclick: () => startSession([game]) },
      cartridge(game)),
    el('div', { class: 'game-info' },
      el('div', {},
        el('div', { class: 'game-name' }, game.name),
        el('div', { class: 'game-meta' }, timeAgo(game.lastPlayed))),
      el('button', {
        class: 'game-more', type: 'button', 'aria-label': `Opções de ${game.name}`,
        onclick: () => gameMenu(game),
      }, dotsIcon())))));
  $('#empty').hidden = games.length > 0;
  $('#btn-link').hidden = games.length === 0;
}

function dotsIcon() {
  // Parsed from markup so the elements get the SVG namespace
  const tmp = document.createElement('div');
  tmp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>';
  return tmp.firstChild;
}

async function gameMenu(game) {
  const hasSave = !!(await db.getSave(game.id));
  const choice = await openSheet({
    title: game.name,
    text: hasSave ? 'Save encontrado.' : 'Ainda sem save.',
    actions: [
      { label: 'Jogar', value: 'play', kind: 'primary' },
      { label: 'Trocar com outro jogo…', value: 'link' },
      { label: 'Exportar save (.sav)', value: 'export', disabled: !hasSave },
      { label: 'Importar save (.sav)', value: 'import' },
      { label: 'Renomear', value: 'rename' },
      { label: 'Excluir', value: 'delete', kind: 'danger' },
    ],
  });
  switch (choice) {
    case 'play':
      startSession([game]);
      break;
    case 'link':
      linkSetup(game);
      break;
    case 'export': {
      const save = await db.getSave(game.id);
      await shareOrDownload(save, `${game.name}.sav`);
      break;
    }
    case 'import':
      if (hasSave && !(await confirmSheet('Substituir save?', `O save atual de ${game.name} será substituído pelo arquivo que você escolher.`, 'Escolher arquivo'))) break;
      pendingSaveTarget = game;
      $('#file-save').click();
      break;
    case 'rename': {
      const name = prompt('Nome do jogo', game.name);
      if (name && name.trim()) {
        game.name = name.trim();
        await db.putGame(game);
        renderLibrary();
      }
      break;
    }
    case 'delete':
      if (await confirmSheet(`Excluir ${game.name}?`, 'A ROM e o save deste jogo serão apagados do app. Exporte o save antes se quiser guardá-lo.', 'Excluir')) {
        await db.deleteGame(game.id);
        await loadLibrary();
        toast('Jogo excluído');
      }
      break;
  }
}

async function importRoms(files) {
  let added = 0;
  for (const file of files) {
    try {
      let data = await readFile(file);
      let name = file.name;
      if (/\.zip$/i.test(file.name) || new DataView(data).getUint32(0, true) === 0x04034b50) {
        const entry = await extractFromZip(data);
        data = entry.data;
        name = entry.name.split('/').pop();
      }
      const bytes = new Uint8Array(data);
      if (bytes.length < 0xc0 || bytes[0xb2] !== 0x96) {
        throw new Error(`${file.name} não é uma ROM de GBA.`);
      }
      const ascii = (start, len) => String.fromCharCode(...bytes.subarray(start, start + len)).replace(/\0.*$/, '').trim();
      const code = ascii(0xac, 4);
      const known = KNOWN[code.slice(0, 3)];
      const game = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: known && !/hack|rom/i.test(name) ? known.name : cleanName(name),
        title: ascii(0xa0, 12),
        code,
        size: data.byteLength,
        addedAt: Date.now(),
        lastPlayed: 0,
      };
      await db.addGame(game, data);
      ++added;
    } catch (e) {
      toast(e.message || String(e), 4000);
    }
  }
  if (added) {
    toast(added === 1 ? 'Jogo importado' : `${added} jogos importados`);
    await loadLibrary();
  }
}

$('#file-rom').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) await importRoms(files);
});

$('#file-save').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const game = pendingSaveTarget;
  pendingSaveTarget = null;
  if (!file || !game) return;
  const data = await readFile(file);
  if (data.byteLength < 512 || data.byteLength > 0x20000 + 64) {
    toast('Esse arquivo não parece um save de GBA.', 3500);
    return;
  }
  await db.putSave(game.id, data);
  toast('Save importado');
});

$('#btn-import').addEventListener('click', () => $('#file-rom').click());
$('#btn-import-empty').addEventListener('click', () => $('#file-rom').click());
$('#btn-link').addEventListener('click', () => linkSetup());
$('#btn-about').addEventListener('click', aboutSheet);

// Pick two games: the first becomes P1 (the parent end of the cable)
async function linkSetup(first = null) {
  if (games.length === 0) return;
  const picked = first ? [first] : [];
  const list = el('div', { class: 'pick-list' });
  const draw = () => {
    list.replaceChildren(...games.map((game) => {
      const slot = picked.indexOf(game);
      return el('button', {
        class: 'pick', type: 'button', 'data-slot': slot >= 0 ? slot : false,
        onclick: () => {
          const i = picked.indexOf(game);
          if (i >= 0) picked.splice(i, 1);
          else if (picked.length < 2) picked.push(game);
          else picked[1] = game;
          draw();
        },
      }, cartridge(game), el('span', { class: 'pick-name' }, game.name),
      slot >= 0 ? el('span', { class: 'pick-slot' }, `P${slot + 1}`) : null);
    }));
    const go = sheet.querySelector('[data-value="go"]');
    if (go) go.disabled = picked.length !== 2;
  };
  draw();
  const text = games.length < 2
    ? 'Importe mais um jogo (ou o mesmo jogo de novo, como outro cartucho) para fazer trocas.'
    : 'Escolha dois cartuchos. Os dois rodam ao mesmo tempo, ligados por um cabo link virtual.';
  const choiceP = openSheet({
    title: 'Troca entre jogos',
    text,
    content: list,
    actions: [{ label: 'Conectar e jogar', value: 'go', kind: 'primary', disabled: picked.length !== 2 }],
  });
  draw();
  if ((await choiceP) === 'go' && picked.length === 2) {
    startSession(picked);
  }
}

function aboutSheet() {
  const content = el('div', {},
    el('ol', { class: 'help' },
      el('li', {}, 'Instalar no iPhone: abra o site no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".'),
      el('li', {}, 'Jogos: salve os arquivos .gba ou .zip no app Arquivos e toque em "+ Jogo".'),
      el('li', {}, 'Troca de Pokémon: toque em "Troca", escolha os dois jogos e, nos dois, vá ao 2º andar do Pokémon Center e fale com a atendente do Cable Club. Toque numa tela para escolher qual jogo os controles comandam.'),
      el('li', {}, 'O jogo grava sozinho quando você salva dentro dele. Exporte os saves de vez em quando: o iOS pode apagar dados de apps web pouco usados.'),
      el('li', {}, 'Sem som? Desligue o modo silencioso do iPhone.')),
    el('p', { class: 'help-note' }, 'Teclado: setas, X = A, Z = B, A/S = L/R, Enter = Start, Backspace = Select. Controles Bluetooth também funcionam.'),
    el('p', { class: 'help-note' }, 'Emulação baseada no GBA.js de Jeffrey Pfau (licença BSD de 2 cláusulas).'));
  openSheet({ title: 'GBA Link', content });
}

// ---------- Playing ----------

const touch = new TouchPad($('#player-view'), applyInput);
const keyboard = new Keyboard(applyInput);
let gamepadMask = 0;

function applyInput() {
  if (!session) return;
  const mask = touch.mask | keyboard.mask | gamepadMask;
  session.machines.forEach((m, i) => m.setButtons(i === session.active ? mask : 0));
}

async function startSession(list) {
  if (session) return;
  let bios, roms, saves;
  try {
    [bios, roms, saves] = await Promise.all([
      getBios(),
      Promise.all(list.map((g) => db.getRom(g.id))),
      Promise.all(list.map((g) => db.getSave(g.id))),
    ]);
  } catch (e) {
    toast(e.message || String(e), 4000);
    return;
  }

  const screens = $('#screens');
  screens.replaceChildren();
  const linked = list.length > 1;
  const machines = [];
  const onError = (message) => crash(message);

  try {
    list.forEach((game, slot) => {
      const canvas = el('canvas', { width: 240, height: 160 });
      const bezel = el('div', { class: 'bezel', 'data-slot': slot },
        el('div', { class: 'bezel-tag' }, linked ? el('b', {}, `P${slot + 1}`) : null, game.name),
        canvas);
      bezel.addEventListener('pointerdown', () => setActive(slot));
      screens.append(bezel);
      const machine = new Machine({
        canvas,
        bios,
        onError,
        onSave: (data) => db.putSave(game.id, data).catch((e) => toast(`Erro ao gravar save: ${e.message}`, 4000)),
      });
      machine.load(roms[slot], saves[slot]);
      machines.push(machine);
    });
  } catch (e) {
    screens.replaceChildren();
    toast(e.message || String(e), 4000);
    return;
  }

  const link = linked ? new LinkCable(machines) : null;
  const runner = new Runner(machines, {
    onError: (e) => crash(e && e.message ? e.message : String(e)),
    beforeFrame: () => {
      const mask = pollGamepads();
      if (mask !== gamepadMask) {
        gamepadMask = mask;
        applyInput();
      }
    },
  });

  session = { games: list, machines, runner, link, active: 0, speedIndex: 0 };
  for (const game of list) {
    game.lastPlayed = Date.now();
    db.putGame(game);
  }

  document.body.classList.add('playing');
  $('#library-view').hidden = true;
  $('#player-view').hidden = false;
  $('#player-view').classList.toggle('linked', linked);
  $('#status-text').textContent = linked ? 'LINK' : 'POWER';
  keyboard.enabled = true;
  setActive(0);
  updateSpeedLabel();
  layoutScreens();
  runner.start();
  resumeAudio();
}

function setActive(slot) {
  if (!session) return;
  session.active = slot;
  session.machines.forEach((m, i) => m.setMuted(i !== slot));
  document.querySelectorAll('.bezel').forEach((b) => b.classList.toggle('active', Number(b.dataset.slot) === slot));
  applyInput();
}

function persistSaves() {
  if (!session) return Promise.resolve();
  return Promise.all(session.games.map((game, i) => {
    const data = session.machines[i].saveData();
    return data ? db.putSave(game.id, data) : null;
  }));
}

async function endSession() {
  if (!session) return;
  session.runner.stop();
  await persistSaves();
  session.link?.unplug();
  session = null;
  touch.reset();
  keyboard.enabled = false;
  document.body.classList.remove('playing');
  $('#player-view').hidden = true;
  $('#library-view').hidden = false;
  $('#screens').replaceChildren();
  await loadLibrary();
}

async function crash(message) {
  if (!session) return;
  session.runner.stop();
  await persistSaves();
  await openSheet({
    title: 'O emulador parou',
    text: `Algo deu errado na emulação: ${message}. O último save gravado pelo jogo está guardado.`,
    actions: [{ label: 'Voltar à biblioteca', value: 'exit', kind: 'primary' }],
  });
  endSession();
}

function updateSpeedLabel() {
  const speed = SPEEDS[session.speedIndex];
  $('#ff-label').textContent = `${speed}×`;
  $('#btn-ff').classList.toggle('on', speed > 1);
  session.runner.setSpeed(speed);
}

$('#btn-ff').addEventListener('click', () => {
  if (!session) return;
  session.speedIndex = (session.speedIndex + 1) % SPEEDS.length;
  updateSpeedLabel();
});

$('#btn-menu').addEventListener('click', async () => {
  if (!session) return;
  const { runner, games: list } = session;
  runner.stop();
  touch.reset();
  const actions = [{ label: 'Continuar', value: 'resume', kind: 'primary' }];
  if (list.length > 1) {
    actions.push({ label: 'Controlar o outro jogo', value: 'swap' });
  }
  list.forEach((game, i) => actions.push({
    label: list.length > 1 ? `Exportar save de P${i + 1}` : 'Exportar save (.sav)', value: `export${i}`,
  }));
  actions.push({ label: 'Reiniciar', value: 'reset' }, { label: 'Sair do jogo', value: 'exit', kind: 'danger' });
  const choice = await openSheet({
    title: list.map((g) => g.name).join(' ⇄ '),
    text: list.length > 1 ? 'Cabo link conectado.' : '',
    actions,
  });
  if (!session) return;
  if (choice === 'exit') {
    endSession();
    return;
  }
  if (choice === 'swap') setActive((session.active + 1) % session.machines.length);
  if (choice?.startsWith('export')) {
    const i = Number(choice.slice(6));
    const data = session.machines[i].saveData();
    if (data) await shareOrDownload(data, `${list[i].name}.sav`);
  }
  if (choice === 'reset' && await confirmSheet('Reiniciar?', 'O progresso desde o último save dentro do jogo será perdido.', 'Reiniciar')) {
    await persistSaves();
    const [roms, saves] = await Promise.all([
      Promise.all(list.map((g) => db.getRom(g.id))),
      Promise.all(list.map((g) => db.getSave(g.id))),
    ]);
    session.machines.forEach((m, i) => m.load(roms[i], saves[i]));
  }
  if (session) {
    resumeAudio();
    session.runner.start();
  }
});

// Fit the screen(s): one big screen, or two stacked (portrait) / side by
// side (landscape) when linked
function layoutScreens() {
  if (!session) return;
  const area = $('#screens');
  const bezels = [...area.querySelectorAll('.bezel')];
  const n = bezels.length;
  const landscape = innerWidth > innerHeight;
  const sideBySide = n > 1 && landscape;
  area.style.flexDirection = sideBySide ? 'row' : 'column';
  // Space the bezel adds around each canvas (padding) plus the gap
  const padX = 28;
  const padY = 30;
  const gap = 10;
  const w = area.clientWidth;
  const h = area.clientHeight;
  const maxW = sideBySide ? (w - gap * (n - 1)) / n - padX : w - padX;
  const maxH = sideBySide ? h - padY : (h - gap * (n - 1)) / n - padY;
  const scale = Math.max(0.5, Math.min(maxW / 240, maxH / 160));
  for (const bezel of bezels) {
    const canvas = bezel.querySelector('canvas');
    canvas.style.width = `${Math.floor(240 * scale)}px`;
    canvas.style.height = `${Math.floor(160 * scale)}px`;
  }
}

addEventListener('resize', layoutScreens);
addEventListener('orientationchange', () => setTimeout(layoutScreens, 250));

function resumeAudio() {
  const ctx = window.GameBoyAdvanceAudio && GameBoyAdvanceAudio.sharedContext;
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

// iOS only lets audio start from a user gesture
addEventListener('pointerdown', resumeAudio, true);

// Pause and write saves whenever the app goes to the background: iOS may
// kill a backgrounded web app without warning
document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.hidden) {
    session.runner.stop();
    persistSaves();
  } else if (!sheet.open) {
    session.runner.start();
  }
});
addEventListener('pagehide', () => { persistSaves(); });

// ---------- Boot ----------

// Skipped on localhost so development always sees fresh files
if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
navigator.storage?.persist?.().catch(() => {});

if (location.hostname === 'localhost') {
  window.gbaDebug = { session: () => session, loadLibrary, startSession, games: () => games };
}

loadLibrary().catch((e) => toast(`Erro ao abrir a biblioteca: ${e.message}`, 5000));
