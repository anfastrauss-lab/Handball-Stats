# Handball Scouting: eigene Website mit automatischem Wochen-Update

Mit dieser Anleitung läuft dein Scouting-Tool als eigene Website. Jeden Montag holt ein Job automatisch die neuen Spiele von handball.ch. Deine Handballfreunde öffnen nur den Link und geben einmal ein Passwort ein. Sie müssen nichts herunterladen.

**Kosten:** keine. **Zeitaufwand:** etwa 20 Minuten einmalig, danach nichts mehr.

## Was hier drin liegt

| Datei | Wozu |
|---|---|
| `index.html` | Das Tool selbst (die Seite). Enthält keine Spielerdaten. |
| `config.json` | Welche Ligen geholt werden. |
| `tools/update.mjs`, `tools/crypto.mjs` | Das Programm, das jede Woche die neuen Spiele holt und die Daten verschlüsselt. |
| `.github/workflows/wochen-update.yml` | Der Wochenplan (jeden Montag). |
| `daten.enc` | Die verschlüsselten Daten. Entsteht beim ersten Lauf von selbst. |

## So funktioniert es

1. GitHub (ein kostenloser Dienst) führt montags das Programm aus. Es holt nur die neuen Spiele von handball.ch.
2. Die Daten werden mit deinem Passwort **verschlüsselt** in `daten.enc` gespeichert.
3. Die Website liegt auf GitHub Pages. Beim Öffnen holt sie `daten.enc` und entschlüsselt die Daten im Browser. Dafür gibst du oder dein Freund einmal das Passwort ein. Der Browser merkt es sich.

Die Datei `daten.enc` ist für alle abrufbar, aber ohne das Passwort nur Zeichensalat.

## Einrichten

### Schritt 1: Konto anlegen
Auf https://github.com ein kostenloses Konto erstellen («Sign up»).

### Schritt 2: Projekt anlegen
1. Oben rechts auf das «+» klicken und «New repository» wählen.
2. Name: `handball-scouting` (oder ein anderer).
3. **«Public»** auswählen (nur so ist die kostenlose Website möglich). Keine Haken bei «Add a README» und Co. setzen.
4. «Create repository».

### Schritt 3: Dateien hochladen
1. Auf der leeren Projektseite auf **«uploading an existing file»** klicken.
2. Alles aus diesem Ordner hineinziehen: `index.html`, `config.json`, `README.md`, den Ordner `tools` und den Ordner `.github`.
3. Unten auf «Commit changes» klicken.

**Falls der Ordner `.github` fehlt** (er ist versteckt und wird manchmal nicht mitgezogen): Auf «Add file», «Create new file» klicken. Als Dateiname genau `.github/workflows/wochen-update.yml` eintippen. Dann den Inhalt der Datei `wochen-update.yml` aus diesem Ordner einfügen und «Commit changes» klicken.

### Schritt 4: Website einschalten
Im Projekt oben auf **«Settings»**, links auf **«Pages»**. Unter «Build and deployment» bei «Source» die Auswahl **«GitHub Actions»** wählen.

### Schritt 5: Passwort festlegen
1. In «Settings» links auf «Secrets and variables», dann «Actions».
2. «New repository secret».
3. Name: `SCOUT_PASSWORD` (genau so, mit Grossbuchstaben).
4. Secret: dein Passwort.

**Das Passwort ist wichtig:** Weil die verschlüsselte Datei öffentlich liegt, könnte jemand versuchen, das Passwort zu erraten. Nimm mindestens 14 Zeichen, zum Beispiel vier zufällige Wörter hintereinander. Kein Geburtsdatum, kein Vereinsname. Schreib es dir auf, ohne das Passwort sind die Daten nicht zu öffnen.

### Schritt 6: Ersten Lauf starten
1. Oben auf **«Actions»** klicken. Falls GitHub fragt, ob du Workflows aktivieren willst, bestätige das.
2. Links auf **«Wochen-Update»**, rechts auf **«Run workflow»** und noch einmal «Run workflow».
3. Warten. Der erste Lauf holt alle Spiele und dauert etwa **10 bis 25 Minuten**. Ein grüner Haken heisst: fertig.

### Schritt 7: Link öffnen
Unter «Settings», «Pages» steht oben die Adresse deiner Website, ungefähr `https://DEIN-NAME.github.io/handball-scouting/`. Öffne sie, gib das Passwort ein, und die Daten sind da.

### Schritt 8: Freunde einladen
Schick ihnen den Link. Das Passwort schickst du **in einer separaten Nachricht**. Beim ersten Öffnen geben sie es ein, danach erinnert sich ihr Browser.

## Danach läuft es von selbst

Jeden Montag um etwa 5:30 bis 6:30 Uhr holt GitHub die neuen Spiele und veröffentlicht die Seite neu. Unter «Actions» siehst du jeden Lauf. Ein roter Kreis heisst: Das Holen hat nicht geklappt (siehe unten). Die Seite läuft dann mit den letzten Daten weiter. GitHub schickt dir bei Fehlern normalerweise eine E-Mail.

In der Seite steht im Reiter «Daten» bei «Gemeinsame Daten», von wann der Stand ist.

## Wenn etwas schiefgeht

**Der Lauf ist rot, und im Protokoll steht, handball.ch lasse den Abruf nicht zu oder es seien zu viele Abfragen fehlgeschlagen.**
Das kann passieren, wenn handball.ch Anfragen von Servern blockiert. Im Browser funktioniert der Abruf nachweislich, vom GitHub-Server aus habe ich es nicht testen können. Dann gibt es den Weg von Hand, der jeweils etwa eine Minute dauert:
1. Öffne dein Tool, lade die Daten wie bisher mit dem Update-Skript (Reiter «Daten»).
2. Im Reiter «Daten» ganz unten aufklappen: «Für den Betreiber: verschlüsselte Datendatei erstellen». Dein Passwort eintragen (dasselbe wie bei `SCOUT_PASSWORD`) und «daten.enc erstellen» klicken.
3. Im Projekt auf «Add file», «Upload files». Die heruntergeladene `daten.enc` hineinziehen (ersetzt die alte) und «Commit changes» klicken.
4. Die Seite wird automatisch neu veröffentlicht.

**Im Protokoll steht, die vorhandene Datei lasse sich mit dem Passwort nicht öffnen.**
Das Passwort bei `SCOUT_PASSWORD` stimmt nicht mehr mit dem überein, mit dem `daten.enc` gemacht wurde. Stell das alte Passwort wieder ein, oder lösche `daten.enc` im Projekt und starte den Lauf neu (er baut alles neu auf, die Freunde brauchen dann das neue Passwort).

**Eine Liga fehlt, oder du willst weitere Ligen.**
Klicke im Projekt auf `config.json`, dann auf das Stift-Symbol. Die Namen müssen genau so geschrieben sein wie auf handball.ch, zum Beispiel «Junioren U13 Promotion S1». Speichern, danach läuft der nächste Lauf mit den neuen Ligen.

**GitHub schaltet den Wochenplan ab.**
GitHub stellt geplante Jobs in öffentlichen Projekten ab, wenn 60 Tage lang nichts im Projekt passiert. Weil der Job jede Woche eine neue Datei speichert, sollte das nicht vorkommen. Falls doch, bekommst du eine E-Mail. Unter «Actions» kannst du den Plan mit einem Klick wieder einschalten.

## Eine neue Version des Tools einspielen

Wenn ich das Tool verbessere, bekommst du eine neue `index.html`. Im Projekt auf `index.html` klicken, auf die drei Punkte rechts oben, «Delete file» (oder einfach hochladen mit «Add file», «Upload files», dann wird die alte ersetzt). Nach dem Speichern wird die Seite neu veröffentlicht.

## Wichtig zu Datenschutz und Fairness

- In den Daten stehen Namen, Jahrgänge und Spielzahlen von Spielern, auch von Junioren. Sie stammen von handball.ch, wo sie öffentlich sind. Gib Link und Passwort nur an Menschen weiter, die du kennst.
- Das Programm stellt im ersten Lauf etwa 1'000 Abfragen und danach pro Woche meist nur ein paar Dutzend bis Hunderte, mit Pausen dazwischen. Es nennt sich in jeder Anfrage «HandballScoutingPrivat». Ob der Schweizerische Handballverband das automatische Auslesen gut findet, habe ich nicht geprüft. Frag am besten kurz beim SHV nach.
- Die Position der Spieler (zum Beispiel «Rückraum links») ist meist nur bei der QHL und NLB eingetragen, und ein Teil der Zahlen fehlt, wenn ein Spiel keine digitale Statistik hat.
