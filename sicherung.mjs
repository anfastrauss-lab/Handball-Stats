// Sicherung der Spielerübersicht und der Merklisten: liest Akten, Techniktests, Änderungsverlauf und (falls eingerichtet)
// die Merklisten aus dem Zentralspeicher und legt sie verschlüsselt in den Ordner «sicherung» (eine Datei pro Tag). Läuft wöchentlich über GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { encrypt } from './crypto.mjs';

const env = (k) => (process.env[k] || '').trim();
const URL_ = env('SUPABASE_URL').replace(/\/$/, ''), KEY = env('SUPABASE_ANON_KEY'), MAIL = env('SICHERUNG_EMAIL'), PW = env('SICHERUNG_PASSWORD'), SCOUT = env('SCOUT_PASSWORD');
const DIR = process.env.SICHERUNG_ORDNER || 'sicherung', BEHALTEN = Number(process.env.SICHERUNG_BEHALTEN || 104);
const fail = (m) => { console.error('FEHLER: ' + m); process.exit(1); };
if (!URL_ || !KEY || !MAIL || !PW) { console.log('Der Zentralspeicher ist noch nicht eingerichtet (Secrets fehlen). Sicherung übersprungen.'); process.exit(0); }
if (SCOUT.length < 8) fail('Das Passwort (Secret SCOUT_PASSWORD) fehlt oder ist kürzer als 8 Zeichen.');

async function login() {
  const r = await fetch(URL_ + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: MAIL, password: PW }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) fail('Anmeldung des Sicherungs-Zugangs fehlgeschlagen: ' + (j.msg || j.error_description || r.status));
  return j.access_token;
}
async function alle(token, pfad) {
  const out = [];
  for (let i = 0; i < 200; i++) {
    const r = await fetch(URL_ + '/rest/v1/' + pfad + (pfad.includes('?') ? '&' : '?') + 'limit=1000&offset=' + i * 1000, { headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) fail('Lesen von «' + pfad.split('?')[0] + '» fehlgeschlagen (' + r.status + '): ' + (await r.text()).slice(0, 200));
    const j = await r.json(); out.push(...j); if (j.length < 1000) break;
  }
  return out;
}
// Merklisten: nur sichern, wenn die Tabellen eingerichtet sind und der Zugang sie lesen darf (Rolle «Sicherung»)
async function optional(token, pfad) {
  const r = await fetch(URL_ + '/rest/v1/' + pfad + (pfad.includes('?') ? '&' : '?') + 'limit=1', { headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
  if (!r.ok) { console.log('Hinweis: «' + pfad.split('?')[0] + '» wird nicht gesichert (' + r.status + ', noch nicht eingerichtet?).'); return null; }
  return alle(token, pfad);
}
const token = await login();
const personen = await alle(token, 'personen?select=*&order=email');
if (!personen.length) fail('Der Sicherungs-Zugang sieht keine Personen. Ist er in der Tabelle «personen» eingetragen und aktiv?');
const daten = {
  art: 'sicherung-spielerakten', version: 1, erstellt: new Date().toISOString(), personen,
  spieler_akten: await alle(token, 'spieler_akten?select=*&order=player_id'),
  techniktests: await alle(token, 'techniktests?select=*&order=id'),
  verlauf: await alle(token, 'verlauf?select=*&order=id'),
  merklisten: await optional(token, 'merklisten?select=*&order=id'),
  merklisten_mitglieder: await optional(token, 'merklisten_mitglieder?select=*&order=liste_id'),
  merkliste: await optional(token, 'merkliste?select=*&order=liste_id,player_id'),
  empfehlungen: await optional(token, 'empfehlungen?select=*&order=id'),
};
if (daten.merklisten && !daten.merklisten.length) console.log('Hinweis: Keine Merklisten gefunden. Hat der Sicherungs-Zugang in der Tabelle «personen» die Rolle «Sicherung»? Sonst sieht er nur eigene Listen.');
fs.mkdirSync(DIR, { recursive: true });
const tag = new Date().toISOString().slice(0, 10), datei = path.join(DIR, 'sicherung-' + tag + '.enc');
fs.writeFileSync(datei + '.tmp', encrypt(JSON.stringify(daten), SCOUT)); fs.renameSync(datei + '.tmp', datei);
const alt = fs.readdirSync(DIR).filter((f) => /^sicherung-\d{4}-\d{2}-\d{2}\.enc$/.test(f)).sort();
for (const f of alt.slice(0, Math.max(0, alt.length - BEHALTEN))) fs.unlinkSync(path.join(DIR, f));
console.log('Sicherung geschrieben: ' + datei + ' (' + daten.spieler_akten.length + ' Akten, ' + daten.techniktests.length + ' Techniktests, ' + daten.verlauf.length + ' Verlaufseinträge, ' + personen.length + ' Personen' + (daten.merklisten ? ', ' + daten.merklisten.length + ' Merklisten mit ' + (daten.merkliste || []).length + ' Einträgen' : '') + ').');
