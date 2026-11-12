import { analyze, sha256 } from './xgf.js';
import { isZip, zipEntries, zipRead } from './zip.js';
import { Link, flash, Aborted } from './iap.js';
import { t, has, setLang, getLang } from './i18n.js';

const $ = id => document.getElementById(id);
const hex = (v, n = 8) => v.toString(16).toUpperCase().padStart(n, '0');

let link = null, busy = false, abortReq = false;
let src = 'rel', relFw = null, fileFw = null, releases = [];
const cache = new Map();                    // release file path -> analysed firmware
const fw = () => (src === 'rel' ? relFw : fileFw);

// ---- log / status / progress ----
function log(msg) {
  const el = $('log');
  el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}
function status(msg, cls = '') {
  $('status').textContent = msg;
  $('status').className = cls;
  if (msg) log(msg);
}
function progress(done, total) {
  const p = $('progress');
  p.hidden = total == null;
  if (total) { p.max = total; p.value = done; }
}
function bootText(s) {
  const el = $('boot');
  el.textContent += s.replace(/\r\n?/g, '\n').replace(/\0/g, '');
  if (el.textContent.length > 20000) el.textContent = el.textContent.slice(-15000);
  el.scrollTop = el.scrollHeight;
}
const errText = e => {
  const m = String(e?.message ?? e);
  const blk = m.match(/^block (\d+)/);
  if (blk) return t('err_block', { n: blk[1] });
  return has('err_' + m) ? t('err_' + m) : m;
};

// ---- UI state ----
function render() {
  const serial = 'serial' in navigator;
  $('choose').disabled = busy || !!link || !serial;
  $('close').disabled = busy || !link;
  $('flash').disabled = busy || !fw() || !serial;
  $('cancel').hidden = !busy;
  for (const el of document.querySelectorAll('input[name=src], #release, #file')) el.disabled = busy;
  $('src-rel').hidden = src !== 'rel';
  const cur = releases[+$('release').value.split(':')[0]];
  if (cur) $('relnotes').textContent = t(cur.nightly ? 'commit' : 'releaseNotes');
  $('src-file').hidden = src !== 'file';
  showAnalysis();
}

function showAnalysis() {
  const a = $('analysis'), f = fw();
  const err = src === 'rel' ? relErr : fileErr;
  a.hidden = !f && !err;
  if (err) {
    a.className = 'bad';
    a.innerHTML = '';
    a.append(Object.assign(document.createElement('p'), { textContent: t('badFile', { why: errText(err) }) }));
    return;
  }
  if (!f) return;
  const i = f.info, lines = [];
  if (i.kind === 'open') lines.push([`${i.label}${f.tag ? ' ' + f.tag : ''}${i.built ? ' — ' + t('built', { date: i.built }) : ''}`]);
  else if (i.kind === 'stock') lines.push([t('kind_stock', { label: i.label })]);
  else lines.push([t('kind_other')]);
  lines.push([t('vec', { size: i.xgf.length, reset: hex(i.vec.reset), sp: hex(i.vec.sp) }), 'detail']);
  lines.push([`SHA-256 ${i.sha}`, 'detail mono']);
  if (f.zipName) lines.push([t('fromZip', { name: f.zipName }), 'detail']);
  if (f.zipMany) lines.push([t('zipMany', { name: f.zipName }), 'detail']);
  if (i.wasRaw) lines.push([t('rawEncrypted'), 'detail']);
  if (f.nightly) lines.push([t('nightlyNote')]);
  a.className = i.kind === 'other' || f.nightly ? 'warn' : 'ok';
  a.innerHTML = '';
  for (const [text, cls] of lines) a.append(Object.assign(document.createElement('p'), { textContent: text, className: cls || '' }));
}

// ---- firmware sources ----
let relErr = null, fileErr = null;

async function loadReleases() {
  try {
    const r = await fetch('fw/releases.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const m = await r.json();
    releases = [...m.releases, ...(m.nightly || []).map(n => ({ ...n, nightly: true }))].filter(x => x.files.length);
  } catch {
    releases = [];
  }
  if (!releases.length) {
    $('relstate').dataset.i18n = 'noReleases';
    $('relstate').textContent = t('noReleases');
    if (src === 'rel') setSource('file');
    return;
  }
  $('relstate').hidden = true;
  $('relrow').hidden = false;
  fillReleases();
  await pickRelease();
}

function fillReleases() {
  const sel = $('release'), keep = sel.value;
  sel.innerHTML = '';
  const repos = new Set(releases.map(r => r.repo));
  const latest = new Set([...repos].map(repo => releases.find(r => r.repo === repo && !r.prerelease && !r.nightly)));
  const groups = { rel: document.createElement('optgroup'), nightly: document.createElement('optgroup') };
  groups.rel.label = t('groupReleases');
  groups.nightly.label = t('groupNightly');
  releases.forEach((r, ri) => r.files.forEach((f, fi) => {
    const tags = [r.date?.slice(0, 10), latest.has(r) ? t('latest') : '', r.prerelease ? t('prerelease') : ''].filter(Boolean);
    const msg = r.nightly && r.name ? ' ' + (r.name.length > 40 ? r.name.slice(0, 39) + '…' : r.name) : '';
    const label = `${repos.size > 1 ? r.repo.split('/').pop() + ' ' : ''}${r.tag}${r.files.length > 1 ? ' / ' + f.name : ''}${msg} (${tags.join(', ')})`;
    groups[r.nightly ? 'nightly' : 'rel'].append(new Option(label, `${ri}:${fi}`));
  }));
  for (const g of Object.values(groups)) if (g.children.length) sel.append(g);
  if (keep) sel.value = keep;
}

async function pickRelease() {
  const [ri, fi] = $('release').value.split(':').map(Number);
  const r = releases[ri], f = r.files[fi];
  $('relnotes').href = r.url;
  relFw = null;
  relErr = null;
  render();
  try {
    let got = cache.get(f.path);
    if (!got) {
      status(t('downloading', { name: f.name }));
      const resp = await fetch(f.path);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = new Uint8Array(await resp.arrayBuffer());
      if (f.sha256 && await sha256(data) !== f.sha256) throw new Error('sha');
      got = { name: f.name, tag: r.nightly ? 'nightly ' + r.tag : r.tag, nightly: !!r.nightly, info: await analyze(data) };
      cache.set(f.path, got);
      status('');
      log(t('fileLoaded', { name: f.name, size: data.length, sha: got.info.sha }));
    }
    if ($('release').value === `${ri}:${fi}`) relFw = got;
  } catch (e) {
    relErr = e;
    status(t('badFile', { why: errText(e) }), 'err');
  }
  render();
}

async function loadFile(file) {
  if (!file) return;
  fileFw = null;
  fileErr = null;
  try {
    let data = new Uint8Array(await file.arrayBuffer());
    const f = { name: file.name };
    $('fileinfo').removeAttribute('data-i18n');
    if (isZip(data)) {
      const xs = zipEntries(data).filter(e => /\.xgf$/i.test(e.name) && !/(^|\/)__MACOSX\//.test(e.name));
      if (!xs.length) throw new Error('noXgfInZip');
      f.zipName = xs[0].name;
      f.zipMany = xs.length > 1;
      data = await zipRead(data, xs[0]);
    }
    f.info = await analyze(data);
    fileFw = f;
    status('');
    $('fileinfo').textContent = t('fileLoaded', { name: file.name, size: file.size, sha: f.info.sha.slice(0, 16) });
    log(t('fileLoaded', { name: f.zipName || file.name, size: data.length, sha: f.info.sha }));
  } catch (e) {
    fileErr = e;
    $('fileinfo').textContent = file.name;
    status(t('badFile', { why: errText(e) }), 'err');
  }
  $('drop').classList.add('has');
  render();
}

function setSource(s) {
  src = s;
  for (const r of document.querySelectorAll('input[name=src]')) r.checked = r.value === s;
  render();
}

// ---- port ----
async function openPort() {
  const port = await navigator.serial.requestPort();      // throws if the chooser is cancelled
  const l = new Link(port);
  try {
    await l.open();
  } catch (e) {
    throw new Error(t('portBusy', { msg: e.message }));
  }
  link = l;
  const { usbVendorId: v, usbProductId: p } = port.getInfo();
  const dev = v != null ? `USB ${hex(v, 4)}:${hex(p, 4)}` : 'serial';
  $('portinfo').removeAttribute('data-i18n');
  $('portinfo').textContent = t('portInfo', { dev });
  log(t('portInfo', { dev }));
  render();
}

async function closePort() {
  const l = link;
  link = null;
  $('portinfo').dataset.i18n = 'noPort';
  $('portinfo').textContent = t('noPort');
  render();
  if (l) await l.close();
}

// ---- flash ----
async function doFlash() {
  const f = fw();
  if (!f || busy) return;
  if (!link || link.closed) {
    if (link) await closePort();
    try { await openPort(); } catch (e) {
      if (e.name !== 'NotFoundError') status(t('error', { msg: e.message }), 'err');
      return;
    }
  }
  busy = true;
  abortReq = false;
  render();
  $('boot').textContent = '';
  progress(0, null);
  log(`${f.tag || f.zipName || f.name}: ${f.info.xgf.length} B, SHA-256 ${f.info.sha}`);
  try {
    const ok = await flash(link, f.info.xgf, {
      text: bootText,
      state: s => { status(t('st_' + s)); if (s === 'sending') progress(0, 1); },
      progress,
      aborted: () => abortReq,
    });
    status(t(ok ? 'done' : 'doneNoComplete'), ok ? 'ok' : 'err');
  } catch (e) {
    console.error(e);
    progress(0, null);
    if (e instanceof Aborted) status(t('aborted'), 'err');
    else if (link?.closed) { status(t('error', { msg: t('portLost') }), 'err'); await closePort(); }
    else status(t('error', { msg: errText(e) }), 'err');
  } finally {
    busy = false;
    render();
  }
}

// ---- wiring ----
for (const b of document.querySelectorAll('#lang button')) b.onclick = () => {
  setLang(b.dataset.lang);
  if (releases.length) fillReleases();
  render();
};
setLang(getLang());

if (!('serial' in navigator)) {
  $('noserial').hidden = false;
  $('noserial').dataset.i18n = window.isSecureContext ? 'noSerial' : 'insecure';
  $('noserial').textContent = t($('noserial').dataset.i18n);
}

for (const r of document.querySelectorAll('input[name=src]')) r.onchange = () => setSource(r.value);
$('release').onchange = pickRelease;
$('file').onchange = e => loadFile(e.target.files[0]);
const drop = $('drop');
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (!busy) loadFile(e.dataTransfer.files[0]); };
$('choose').onclick = () => openPort().catch(e => { if (e.name !== 'NotFoundError') status(t('error', { msg: e.message }), 'err'); });
$('close').onclick = closePort;
$('flash').onclick = doFlash;
$('cancel').onclick = () => { abortReq = true; };
navigator.serial?.addEventListener('disconnect', e => {
  if (link && e.target === link.port) { log(t('portLost')); if (!busy) closePort(); }
});
window.addEventListener('beforeunload', e => { if (busy) e.preventDefault(); });

render();
loadReleases();
