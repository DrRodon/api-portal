# bp-chatlog

Lokalny notatnik do zapisywania wpisow o cisnieniu, objawach, lekach, jedzeniu, nawodnieniu i snie. Aplikacja dziala w przegladarce i zapisuje dane lokalnie (localStorage).

## Funkcje
- szybkie dodawanie wpisow (cisnienie, tetno, objawy, sen, jedzenie, wydarzenia)
- sekcja lekow wlaczana przelacznikiem
- podsumowanie widoku: nawodnienie, leki oraz cisnienie/tetno z wykresem
- filtrowanie po dacie, wyszukiwarka, sortowanie
- export/import wpisow i lekow do JSON
- motywy oraz tryb ciemny

## Jak uruchomic
1. Otworz plik `index.html` w przegladarce.
2. Dodawaj wpisy i przegladaj podsumowania.

> Dane sa przechowywane lokalnie w przegladarce (localStorage). Nie ma zadnego backendu.

## Struktura
- `index.html` - glowny formularz i lista wpisow
- `app.js` - logika aplikacji
- `styles.css` - style
- `settings.html` - ustawienia, leki, import/export
- `summary.html` / `summary.js` - wykresy i statystyki
- `themes.js` - motywy

## Import/Export
- **Export JSON** zapisuje wszystkie wpisy
- **Export lekow** zapisuje liste lekow
- **Import** nadpisuje lokalna baze

## Uwagi
- Wykresy w `summary.html` korzystaja z Chart.js (CDN). Offline wykresy moga sie nie zaladowac.

## Prywatnosc
Wszystkie dane pozostaja lokalnie w przegladarce. Nic nie jest wysylane na zewnatrz.
