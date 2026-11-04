# Prüfungsbank

Eine Web-App zum gemeinsamen Pflegen einer Aufgabendatenbank und zum Zusammenstellen von Prüfungen
(Mathematik, Physik, Informatik). Läuft als statische Seite auf GitHub Pages; die gemeinsamen Daten
liegen bei Supabase. Es ist kein eigener Server nötig.

## Das kann die App

- **Aufgabenbank** mit Fach, Klassenstufe, Thema, Anforderungsbereich (AFB I–III), Punkten, Schlagwörtern, Lösung und Bild
- **Aufgabentypen:** freie Aufgabe, Multiple Choice, Wahr/Falsch, Lückentext, Aufgabe mit Teilaufgaben a), b), …
- **Formeln** in LaTeX-Schreibweise (`$x^2$`, `$$\frac{a}{b}$$`), Code in Backticks
- **Prüfungseditor:** Aufgaben per Drag & Drop aus der Bank in den Bogen ziehen, sortieren, direkt im Bogen ändern
  (Änderungen gelten nur für diese Prüfung), live Punktesumme und AFB-Verteilung gegen 30/50/20 %
- **Export:** PDF (Druckdialog → „Als PDF speichern“) und ODT, jeweils mit oder ohne Lösungen
- **Zusammenarbeit:** ein gemeinsames Passwort, automatisches Speichern, Warnung bei gleichzeitiger Änderung
- **Import/Export der Aufgabenbank** als JSON (Sicherung, Umzug, Übernahme von Aufgaben)

## 1. Lokal ausprobieren

Ohne Einrichtung läuft die App im **Lokal-Modus** (Daten nur in diesem Browser).

```
cd pruefungsbank
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Zum Testen kann man `beispiel-aufgaben.json` über „Importieren (JSON)“ laden.

## 2. Gemeinsame Datenbank mit Supabase einrichten (einmalig, ca. 15 Minuten)

1. Konto auf [supabase.com](https://supabase.com) anlegen und ein **neues Projekt** erstellen.
   Region: **Central EU (Frankfurt)**. Das Datenbank-Passwort sicher aufbewahren.
2. Im Projekt links **SQL Editor** öffnen, den gesamten Inhalt von `supabase/schema.sql` einfügen und ausführen.
3. **Authentication → Users → Add user → Create new user**
   - E-Mail: `lehrkraefte@schule.example` (muss mit `SHARED_EMAIL` in `js/config.js` übereinstimmen)
   - Passwort: das **gemeinsame Lehrkräfte-Passwort** (lang wählen, z. B. drei Wörter plus Zahl)
   - „Auto Confirm User“ anhaken
4. **Authentication → Sign In / Providers**: „Allow new users to sign up“ **ausschalten**,
   damit sich niemand selbst registrieren kann.
5. **Project Settings → API**: „Project URL“ und den Schlüssel „anon public“ kopieren und in `js/config.js` eintragen:

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJ…",
SCHOOL_NAME: "Name der Schule"
```

Der anon-Schlüssel darf öffentlich sichtbar sein. Geschützt sind die Daten durch die Zugriffsregeln aus `schema.sql`:
Ohne Login gibt es keinen Zugriff.

## 3. Auf GitHub Pages veröffentlichen

1. Neues Repository anlegen und alle Dateien dieses Ordners hochladen (die `config.js` mit den Supabase-Angaben eingeschlossen).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)`** wählen.
3. Nach ca. einer Minute ist die App unter `https://<name>.github.io/<repo>/` erreichbar.

Es gibt keine externen Abhängigkeiten (KaTeX und JSZip liegen im Ordner `vendor/`), es werden also keine Drittanbieter-Server
von den Browsern der Kolleginnen und Kollegen kontaktiert, außer Supabase für die Daten. Die Seite ist mit `noindex` markiert.

## Hinweise zum Datenschutz und Betrieb

- Keine Schülerdaten in Aufgaben ablegen (Namen, Noten, Fotos von Schülerarbeiten).
- Mit dem Datenschutzbeauftragten klären, ob ein Auftragsverarbeitungsvertrag mit Supabase und die EU-Region genügen.
- Gehört jemand nicht mehr zum Kreis, das gemeinsame Passwort in Supabase ändern (Authentication → Users).
- Im kostenlosen Tarif kann Supabase Projekte nach längerer Inaktivität pausieren; das Projekt lässt sich im Dashboard mit einem Klick wieder starten. Aktuelle Bedingungen bitte direkt bei Supabase prüfen.
- Sicherung: In der Aufgabenbank „Exportieren (JSON)“ nutzen.

## Aufgaben-JSON (Import)

Ein Import akzeptiert eine Liste von Aufgaben. Dieses Format eignet sich auch, um bestehende Klassenarbeiten
von Claude in Aufgaben zerlegen zu lassen (Arbeit hochladen, JSON erzeugen lassen, hier importieren).

```json
{
  "format": "pruefungsbank-aufgaben",
  "version": 1,
  "questions": [
    {
      "type": "teil",
      "subject": "Mathematik",
      "grade": "9",
      "topic": "Quadratische Funktionen",
      "afb": 1,
      "text": "Gegeben ist $f(x)=x^2-4x+3$.",
      "parts": [
        { "text": "Bestimmen Sie die Nullstellen.", "points": 3, "afb": 1, "solution": "$x_1=1$, $x_2=3$" }
      ]
    },
    { "type": "mc", "subject": "Physik", "grade": "8", "topic": "Elektrizität", "afb": 1, "points": 2,
      "text": "Einheit der Stromstärke?",
      "options": [ { "t": "Volt", "ok": false }, { "t": "Ampere", "ok": true } ] }
  ]
}
```

Typen: `frei`, `mc`, `wf` (mit `"wahr": true/false`), `luecke` (Lücken als `[[Antwort]]`), `teil` (mit `parts`).
Fächer: `Mathematik`, `Physik`, `Informatik`. Klassenstufen: `5`–`10`, `E`, `Q1`, `Q2`. AFB: `1`, `2`, `3`.

## Bekannte Grenzen und mögliche nächste Schritte

- **ODT und Formeln:** Standardmäßig werden Formeln als Formelobjekte eingebettet (in LibreOffice editierbar).
  Falls Formeln in deiner Textverarbeitung fehlen, im Export-Menü „Formeln als einfachen Text“ ankreuzen.
- **Gleichzeitiges Bearbeiten:** Es gilt „zuletzt gespeichert gewinnt“, mit Rückfrage bei Konflikt. Eine Live-Zusammenarbeit
  im Sekundentakt gibt es nicht; die Listen aktualisieren sich alle 45 Sekunden.
- **Bilder** werden verkleinert in der Datenbank gespeichert; für sehr viele Bilder wäre Supabase Storage besser.
- **KI-Import direkt in der App** (Klassenarbeit hochladen → Aufgaben): möglich über eine Supabase Edge Function, die die
  Claude-API aufruft. Dafür braucht es einen API-Schlüssel, der geheim in Supabase liegt, und die Nutzung wird pro Anfrage
  separat abgerechnet.
