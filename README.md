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

```
docs/assets/js/
  fraction.js        exakte Brüche auf BigInt
  intervals.js       Intervallmengen über Q
  formula.js         Parser, Pretty-Printer, Linearformen
  theory-eq.js       Gleichheitstheorie: Klassen und Partitionen
  theory-real.js     reelle Theorie mit einem Parameter, Projektion per Zellzerlegung
  automaton.js       DSL, Simulation, Leerheit, Determinismus, Produkte, Checks
  examples.js        Beispielkatalog aus beiden Papern
  positions-core.js  Positionen, Nachfolgermatrizen, BFS
  draw.js            SVG-Rendering
  playground.js      UI des Playgrounds
  positions.js       UI der Positions-Seite
```

## Tests

```
node test/run-all.js
```

Vier Suiten: Grundlagen (Brüche, Intervalle, Parser), Engine (die Tabelle aus dem Plan,
Produkte, Entscheidungsverfahren), Positionen (Matrizen aus ATVA, Simulation gegen
Matrixformel auf zufälligen 1-VA) und Seitentests, die die HTML-Seiten in headless Chrome
laden und durchklicken. Ohne installiertes Chrome überspringt die letzte Suite sich selbst.

## Was exakt ist

Mitgliedschaft, Parametermengen, Läufe, Leerheit, Determinismus per Belegung und die
Produktkonstruktionen sind exakt, über rationalen Zahlen mit Brüchen statt Gleitkomma.

Alles, was über *alle* Wörter quantifiziert (Universalität, CFPA-Eigenschaft,
Skolem-Bedingung, SDPA, Äquivalenz), wird nur bis zu einer Längenschranke geprüft und ist
im UI entsprechend beschriftet. Ein gefundenes Gegenbeispiel ist exakt; das Ausbleiben
eines Gegenbeispiels ist kein Beweis. Universalität von PA ist unentscheidbar, für 1-VA
entscheidbar, aber Ackermann-hart und hier nicht implementiert.

## Grenzen dieser Fassung

- Über den reellen Zahlen genau ein Parameter. Mehrere bräuchten Polyeder statt Intervalle.
- Keine ε-Transitionen.
- Größtes F_c nur in der Gleichheitstheorie (das direkte Produkt verdoppelt die Parameter).
