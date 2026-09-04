# infinite-alphabets

Interaktiver Playground für parametrisierte Automaten (PA) und Variablenautomaten (VA)
über unendlichen Alphabeten, zu zwei Papern von Franziska Alber und Philipp Rümmer:

- CIAA: *Complementable Normal Form of Parametrized Automata*
- ATVA: *Universality of 1-Variable Automata is Decidable*

Die Seite macht die Beispiele aus beiden Arbeiten nachrechenbar, lässt eigene Automaten
testen und animiert die Beweisidee des ATVA-Papers (Positionen als wandernde Tokens).

## Seiten

| Datei | Inhalt |
|---|---|
| `docs/index.html` | Landing-Page, je ein Absatz pro Paper |
| `docs/playground.html` | PA-Playground: Simulation, Produkte, Prüfungen |
| `docs/positions.html` | Token-Animation und Positions-Erkundung für 1-VA |
| `docs/semantics.html` | was genau gerechnet wird, mit den Grenzen |

Kein Build-Schritt, keine externen Ressourcen, keine ES-Module: die Seiten laufen auch
direkt aus dem Dateisystem über `file://`.

## Module

Die Seiten sind zweisprachig (Englisch ist Standard) und kennen drei Themes
(hell, dunkel, grau) nach dem Designsystem von alber.me.

```
docs/assets/js/
  strings.js         alle sichtbaren Texte, Deutsch und Englisch
  messages.js        Meldungen aus der Engine, Englisch (Deutsch steht im Aufruf)
  site-chrome.js     Theme- und Sprachumschalter samt Umschaltanimationen
  fraction.js        exakte Brüche auf BigInt
  intervals.js       Intervallmengen über Q
  formula.js         Parser, Pretty-Printer, Linearformen
  theory-eq.js       Gleichheitstheorie: Klassen und Partitionen
  theory-real.js     reelle Theorie mit einem Parameter, Projektion per Zellzerlegung
  automaton.js       DSL, Simulation, Leerheit, Determinismus, Produkte, Checks
  examples.js        Beispielkatalog aus beiden Papern
  positions-core.js  Positionen, Nachfolgermatrizen, BFS
  tikz.js            Export als tikz-Bild im Stil der Paper
  share.js           kompakte Kodierung von Automaten und Wort fuer den URL-Hash
  draw.js            SVG-Rendering
  numberline.js      Zahlenstrahl: Wort als Punktfolge, y als ziehbare Marke
  langmap.js         Sprachkarte: alle Woerter bis Laenge n, eines je Kachel
  playground.js      UI des Playgrounds
  positions.js       UI der Positions-Seite
```

## Tests

```
node test/run-all.js
```

Einzelne Seite als Screenshot ansehen (headless Chrome, ohne npm-Paket):

```
node test/shot.js playground.html
```

`--js=<ausdruck>` wertet einen Ausdruck auf der fertigen Seite aus und gibt sein Ergebnis
aus, für Fragen, die kein Bild beantwortet (etwa nach Kontrastwerten).

Sechs Suiten: Grundlagen (Brüche, Intervalle, Parser), Engine (die Tabelle aus dem Plan,
Produkte, Entscheidungsverfahren), Positionen (Matrizen aus ATVA, Simulation gegen
Matrixformel auf zufälligen 1-VA), Beispiele (jedes Beispiel gegen seine Sprache, plus
TikZ-Export), Ansichten (Zahlenstrahl und Sprachkarte, letztere als Kreuzprobe gegen
`checkEquivalence` und `checkUniversality`) und Seitentests, die die HTML-Seiten in headless Chrome laden und
durchklicken; sie melden auch Konsolenfehler, die erst durch die Klicks entstehen. Ohne installiertes Chrome überspringt die letzte Suite sich selbst.

Die Seitentests laden die Seiten mit `?lang=de`, weil ihre Erwartungen die deutschen
Texte prüfen. Zusätzlich prüfen sie pro Seite die Chrome: Englisch als Standard, den
Sprachwechsel, die drei Skins samt Polarität und Persistenz, und dass in der englischen
Fassung keine deutschen Reste stehen.

## Was exakt ist

Mitgliedschaft, Parametermengen, Läufe, Leerheit, Determinismus per Belegung und die
Produktkonstruktionen sind exakt, über rationalen Zahlen mit Brüchen statt Gleitkomma.

Alles, was über *alle* Wörter quantifiziert (Universalität, CFPA-Eigenschaft,
Skolem-Bedingung, SDPA, Äquivalenz), wird nur bis zu einer Längenschranke geprüft und ist
im UI entsprechend beschriftet. Ein gefundenes Gegenbeispiel ist exakt; das Ausbleiben
eines Gegenbeispiels ist kein Beweis. Universalität von PA ist unentscheidbar, für 1-VA
entscheidbar, aber Ackermann-hart und hier nicht implementiert.

Dieselbe Schranke gilt für die Sprachkarte: jede einzelne Kachel ist exakt, die Karte als
ganze endet bei der eingestellten Länge und sagt über längere Wörter nichts.

Der Zahlenstrahl liest nur ab, was die Simulation ohnehin gerechnet hat: ein Zustand ist
unter y = μ aktiv, wenn μ in seiner Parametermenge liegt, und eine Transition feuert, wenn
μ ihre Formel unter dem gelesenen Buchstaben erfüllt. Die Marke selbst ist ein Bruch, kein
Gleitkommawert; gerastert wird sie auf ein Achtel des Teilstrichabstands.

## Grenzen dieser Fassung

- Über den reellen Zahlen genau ein Parameter. Mehrere bräuchten Polyeder statt Intervalle.
- Keine ε-Transitionen.
- Größtes F_c nur in der Gleichheitstheorie (das direkte Produkt verdoppelt die Parameter).
