// Holt neue Spiele von handball.ch, ergänzt die bestehende verschlüsselte Datei (daten.enc)
// und schreibt sie neu. Läuft jede Woche automatisch (siehe .github/workflows/wochen-update.yml).
//
// Benötigt: Node 18 oder neuer. Das Passwort kommt aus der Umgebungsvariable SCOUT_PASSWORD.
// Gelesen werden nur öffentliche Daten, die handball.ch selbst im Matchcenter anzeigt.
import fs from 'node:fs';
import { encrypt, decrypt } from './crypto.mjs';

const API_BASE = (process.env.API_BASE || 'https://www.handball.ch').replace(/\/$/, '');
const API = API_BASE + '/Umbraco/Api/MatchCenter/Query';
const FILE = process.env.DATEN_DATEI || 'daten.enc';
const PW = process.env.SCOUT_PASSWORD || '';
const fail = (msg) => { console.error('FEHLER: ' + msg); process.exit(1); };
if (PW.length < 8) fail('Das Passwort (Secret SCOUT_PASSWORD) fehlt oder ist kürzer als 8 Zeichen.');
const cfg = JSON.parse(fs.readFileSync(process.env.CONFIG || 'config.json', 'utf8'));
const LIGEN = Array.isArray(cfg.ligen) ? cfg.ligen : [];
// Muster (Teilwörter): alle Ligen, deren Name das Muster enthält, und alle Gruppen, in denen ein Team mit diesem Namen spielt
const normT = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const LIGEN_TEIL = (Array.isArray(cfg.ligenEnthalten) ? cfg.ligenEnthalten : []).map(normT).filter(Boolean);
const VEREINE = (Array.isArray(cfg.vereineEnthalten) ? cfg.vereineEnthalten : []).map(normT).filter(Boolean);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? cfg.pausenMs ?? 250);
// Ehrlich benannt: ein privates Projekt, das einmal pro Woche wenige Abfragen stellt.
const HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'HandballScoutingPrivat/1.0 (woechentlicher Abruf, privates Projekt)' };

const Q_SEASON = '{ season { objectId isActual } }';
const LV = 'objectId name objectType';
const Q_MENU = 'query getMenu($s: Int) { menuItem(seasonId: $s) { ' + LV + ' menuItem { ' + LV + ' menuItem { ' + LV + ' menuItem { ' + LV + ' menuItem { ' + LV + ' } } } } } }';
const Q_NAV = 'query getGroupNavigationDetail($groupId: Int) { groupNavigationDetail(groupId: $groupId) { groupId groupName categoryName seasonName } }';
const Q_GAMES = 'query getGames($groupId: Int) { games(groupId: $groupId) { objectId homeTeamId homeTeamName homeTeamClubId homeTeamScore awayTeamId awayTeamName awayTeamClubId awayTeamScore gameDateTime } }';
const Q_CLUBS = '{ club { clubId name zipCode city canton latitude longitude } }';
const Q_PSTATS = 'query getPlayerStats($groupId: Int) { playerStats(groupId: $groupId) { playerId playerYear position hand } }';
const Q_KADER = 'query getPlayerStaff($teamId: Int) { playerStaff(teamId: $teamId) { player { playerId year position hand } } }';
const Q_STATS = 'query getGamePlayerStats($gameId: Int, $isLive: Boolean) { gamePlayerStats(gameId: $gameId, isLive: $isLive) { gameId teamId playerId dressNr playerName totalScore totalShots totalScore7m totalShots7m technicalErrors total2Minutes totalSuspension totalWarnings function totalSaves totalShotsGK totalSaves7m totalShots7mGK } }';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const zahl = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
const erstes = (x) => (Array.isArray(x) ? x[0] : x);
const liste = (x) => (Array.isArray(x) ? x : x ? [x] : []);
let total = 0, failed = 0;

async function abfrage(operationName, query, variables) {
  total++;
  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      const res = await fetch(API, { method: 'POST', headers: HEADERS, body: JSON.stringify({ operationName, variables, query }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
      await sleep(PAUSE_MS);
      return json.data;
    } catch (e) {
      if (versuch === 3) { failed++; console.warn('Abfrage fehlgeschlagen (' + operationName + ' ' + JSON.stringify(variables) + '): ' + e.message); return null; }
      await sleep(1000 * versuch);
    }
  }
  return null;
}

// 1) Bisherige Daten lesen
let data = { version: 4, groups: [], games: [], stats: [], players: [], clubs: [], teams: [] };
if (fs.existsSync(FILE)) {
  try { data = JSON.parse(decrypt(fs.readFileSync(FILE, 'utf8'), PW)); }
  catch (e) { fail('Die vorhandene ' + FILE + ' lässt sich mit dem Passwort nicht öffnen. Wurde das Passwort geändert? Dann lösche die Datei ' + FILE + ' im Repository, damit sie neu aufgebaut wird.'); }
  for (const k of ['groups', 'games', 'stats', 'players', 'clubs', 'teams']) if (!Array.isArray(data[k])) data[k] = [];
}
const bekannt = new Set(data.games.filter((g) => g.hasStats).map((g) => g.gameId));
console.log('Bisher: ' + data.groups.length + ' Gruppen, ' + data.games.length + ' Spiele, ' + data.stats.length + ' Spielerzeilen.');

// 2) Gruppen der gewünschten Ligen über das Menü der aktuellen Saison finden
const gruppenInfo = new Map(), proLiga = new Map();
try {
  const saison = liste(((await abfrage(null, Q_SEASON, {})) || {}).season);
  const aktuell = saison.find((s) => s.isActual) || saison[0];
  const baum = await abfrage('getMenu', Q_MENU, { s: aktuell.objectId });
  const gehe = (knoten, liga) => {
    for (const m of liste(knoten)) {
      if (m.objectType === 'league') liga = m.name;
      if (m.objectType === 'group' && liga) { gruppenInfo.set(m.objectId, liga); if (!proLiga.has(liga)) proLiga.set(liga, []); proLiga.get(liga).push(m.objectId); }
      gehe(m.menuItem, liga);
    }
  };
  gehe(baum && baum.menuItem, null);
} catch (e) { console.warn('Menü konnte nicht gelesen werden: ' + e.message); }
for (const l of LIGEN) if (!proLiga.has(l)) console.warn('Liga «' + l + '» wurde im Menü nicht gefunden (Schreibweise in config.json prüfen).');
const alle = new Set(data.groups.map((g) => g.groupId));
for (const l of LIGEN) for (const id of proLiga.get(l) || []) alle.add(id);
for (const [liga, ids] of proLiga) if (LIGEN_TEIL.some((m) => normT(liga).includes(m))) for (const id of ids) alle.add(id);
// Gruppen suchen, in denen ein Team des gewünschten Vereins spielt (auch Juniorinnen, Cup und so weiter)
const vorab = new Map();
if (VEREINE.length) {
  let gefunden = 0;
  for (const groupId of gruppenInfo.keys()) {
    if (alle.has(groupId)) continue;
    const sp = liste(((await abfrage('getGames', Q_GAMES, { groupId })) || {}).games); vorab.set(groupId, sp);
    if (sp.some((g) => VEREINE.some((m) => normT(g.homeTeamName).includes(m) || normT(g.awayTeamName).includes(m)))) { alle.add(groupId); gefunden++; }
  }
  console.log('Zusätzliche Gruppen mit Teams des Vereins (' + (cfg.vereineEnthalten || []).join(', ') + '): ' + gefunden);
}
if (!alle.size) fail('Es wurde keine einzige Gruppe gefunden. Entweder blockiert handball.ch den Abruf, oder die Ligen in config.json stimmen nicht.');
console.log(alle.size + ' Gruppen werden geprüft.');

// 3) Pro Gruppe die Spielliste lesen und nur neue Spiele holen
const neu = { groups: [], games: [], stats: [], players: [], clubs: [], teams: [] };
for (const c of liste(((await abfrage(null, Q_CLUBS, {})) || {}).club)) {
  const lat = Number(c.latitude), lon = Number(c.longitude);
  if (c.clubId != null && Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) neu.clubs.push({ clubId: c.clubId, name: c.name, zip: c.zipCode || '', city: c.city || '', canton: c.canton || '', lat, lon });
}
const spieler = new Map(), teams = new Map(), jetzt = Date.now();
let nr = 0;
for (const groupId of alle) {
  nr++;
  const nav = erstes(((await abfrage('getGroupNavigationDetail', Q_NAV, { groupId })) || {}).groupNavigationDetail) || {};
  const spiele = vorab.has(groupId) ? vorab.get(groupId) : liste(((await abfrage('getGames', Q_GAMES, { groupId })) || {}).games);
  if (!spiele.length) { console.warn('Gruppe ' + groupId + ': keine Spiele gefunden.'); continue; }
  for (const g of spiele) {
    if (g.homeTeamId != null && g.homeTeamClubId != null) teams.set(g.homeTeamId, { teamId: g.homeTeamId, clubId: g.homeTeamClubId, name: g.homeTeamName });
    if (g.awayTeamId != null && g.awayTeamClubId != null) teams.set(g.awayTeamId, { teamId: g.awayTeamId, clubId: g.awayTeamClubId, name: g.awayTeamName });
  }
  const liga = gruppenInfo.get(groupId) || nav.categoryName || '';
  neu.groups.push({ groupId, name: nav.groupName || 'Gruppe ' + groupId, category: liga, season: nav.seasonName || '', gameIds: spiele.map((g) => g.objectId) });
  const offen = spiele.filter((g) => zahl(g.homeTeamScore) + zahl(g.awayTeamScore) > 0 && new Date(g.gameDateTime).getTime() <= jetzt && !bekannt.has(g.objectId));
  console.log('Gruppe ' + nr + '/' + alle.size + ' (' + liga + ' ' + (nav.groupName || groupId) + '): ' + offen.length + ' neue Spiele');
  if (!offen.length) continue;
  for (const p of liste(((await abfrage('getPlayerStats', Q_PSTATS, { groupId })) || {}).playerStats)) {
    if (p.playerId != null && p.playerYear) spieler.set(p.playerId, { playerId: p.playerId, year: zahl(p.playerYear), position: p.position || '', hand: p.hand || '' });
  }
  if (/QHL|NLB/.test(liga)) {
    const ts = new Set(); spiele.forEach((g) => { ts.add(g.homeTeamId); ts.add(g.awayTeamId); });
    for (const teamId of ts) for (const e of liste(((await abfrage('getPlayerStaff', Q_KADER, { teamId })) || {}).playerStaff)) for (const p of (e && e.player) || []) {
      if (p.playerId == null) continue;
      const alt = spieler.get(p.playerId) || { year: 0, position: '', hand: '' };
      spieler.set(p.playerId, { playerId: p.playerId, year: zahl(p.year) || alt.year, position: p.position || alt.position, hand: p.hand || alt.hand });
    }
  }
  for (const g of offen) {
    const s = await abfrage('getGamePlayerStats', Q_STATS, { gameId: g.objectId, isLive: false });
    let mit = false;
    for (const z of liste(s && s.gamePlayerStats)) {
      if (z.function !== 'player' && z.function !== 'goalkeeper') continue;
      mit = true;
      neu.stats.push({ gameId: g.objectId, teamId: z.teamId, playerId: z.playerId, name: z.playerName, nr: zahl(z.dressNr), role: z.function === 'goalkeeper' ? 'G' : 'F',
        goals: zahl(z.totalScore), shots: zahl(z.totalShots), goals7: zahl(z.totalScore7m), shots7: zahl(z.totalShots7m), tf: zahl(z.technicalErrors), min2: zahl(z.total2Minutes), warn: zahl(z.totalWarnings), dq: zahl(z.totalSuspension),
        saves: zahl(z.totalSaves), shotsGK: zahl(z.totalShotsGK), saves7: zahl(z.totalSaves7m), shots7GK: zahl(z.totalShots7mGK) });
    }
    neu.games.push({ gameId: g.objectId, groupId, date: g.gameDateTime, homeTeamId: g.homeTeamId, homeName: g.homeTeamName, homeScore: zahl(g.homeTeamScore), awayTeamId: g.awayTeamId, awayName: g.awayTeamName, awayScore: zahl(g.awayTeamScore), hasStats: mit });
  }
}
neu.players = [...spieler.values()]; neu.teams = [...teams.values()];

// 4) Sicherheitsnetz: bei zu vielen Fehlern nichts überschreiben
console.log('Abfragen: ' + total + ', fehlgeschlagen: ' + failed + '.');
if (total && failed / total > 0.15) fail('Zu viele Abfragen sind fehlgeschlagen (' + failed + ' von ' + total + '). ' + FILE + ' wurde nicht verändert.');
if (!neu.groups.length) fail('Keine einzige Gruppe konnte gelesen werden. ' + FILE + ' wurde nicht verändert.');

// 5) Zusammenführen (gleiche Regeln wie im Tool)
const gr = new Map(data.groups.map((g) => [g.groupId, g])), gm = new Map(data.games.map((g) => [g.gameId, g])), st = new Map(data.stats.map((r) => [r.gameId + '|' + r.playerId, r]));
const pl = new Map(data.players.map((p) => [p.playerId, p])), cl = new Map(data.clubs.map((c) => [c.clubId, c])), tm = new Map(data.teams.map((t) => [t.teamId, t]));
for (const g of neu.groups) { const { gameIds, ...rest } = g; gr.set(g.groupId, rest); }
for (const g of neu.games) { const alt = gm.get(g.gameId); if (!alt || g.hasStats || !alt.hasStats) gm.set(g.gameId, g); }
for (const r of neu.stats) st.set(r.gameId + '|' + r.playerId, r);
for (const p of neu.players) { const o = pl.get(p.playerId) || {}; pl.set(p.playerId, { playerId: p.playerId, year: p.year || o.year || 0, position: p.position || o.position || '', hand: p.hand || o.hand || '' }); }
for (const c of neu.clubs) cl.set(c.clubId, c);
for (const t of neu.teams) tm.set(t.teamId, t);
let entfernt = 0;
for (const g of neu.groups) { const behalten = new Set(g.gameIds); for (const [id, sp] of gm) if (String(sp.groupId) === String(g.groupId) && !behalten.has(id)) { gm.delete(id); entfernt++; } }
if (entfernt) for (const [k, r] of st) if (!gm.has(r.gameId)) st.delete(k);
const out = { version: 4, erstellt: new Date().toISOString(), groups: [...gr.values()], games: [...gm.values()], stats: [...st.values()], players: [...pl.values()], clubs: [...cl.values()], teams: [...tm.values()] };

// 6) Verschlüsselt speichern (erst in eine Zwischendatei, damit nie eine halbe Datei liegen bleibt)
fs.writeFileSync(FILE + '.tmp', encrypt(JSON.stringify(out), PW)); fs.renameSync(FILE + '.tmp', FILE);
console.log('Fertig: ' + neu.games.length + ' neue Spiele' + (entfernt ? ', ' + entfernt + ' fremde Spiele entfernt' : '') + '. Jetzt ' + out.groups.length + ' Gruppen, ' + out.games.length + ' Spiele, ' + out.stats.length + ' Spielerzeilen, ' + out.players.length + ' Spieler.');
