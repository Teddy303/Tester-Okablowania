# Tester okablowania

Mobilna aplikacja PWA do zapisywania wyników kontroli połączeń patchpanel–gniazdo. Jest przystosowana do używania na telefonie i po pierwszym uruchomieniu może działać również bez internetu.

Docelowy adres GitHub Pages: <https://teddy303.github.io/Tester-Okablowania/>

Zakresy numerów:

- 0001–0099
- 1001–1140
- 2001–2140
- 3001–3140

Dane pomiarowe są przechowywane lokalnie w przeglądarce urządzenia. Dla każdego piętra można wskazać ostatni wykorzystany numer; dalsze numery z tego zakresu nie są wtedy liczone ani umieszczane w raporcie. Przy błędzie można wybrać uszkodzony kabel, błędnie zakończone gniazdko, błędnie zakończony keystone albo wpisać własny opis. Aplikacja generuje raport do wydruku/PDF, eksport CSV zgodny z Excelem oraz kopię bezpieczeństwa JSON.

## Trwałość danych

- Zamknięcie aplikacji lub ponowne uruchomienie telefonu nie usuwa wyników.
- Wyniki należą do konkretnej przeglądarki i konkretnego adresu strony.
- Wyczyszczenie danych przeglądarki może je usunąć, dlatego warto regularnie wybierać **Raport → Pobierz kopię**.
- Po zmianie adresu strony należy pobrać kopię JSON pod starym adresem, a następnie wybrać **Wczytaj kopię** pod nowym adresem.

## GitHub Pages

Pliki aplikacji są umieszczone w katalogu głównym repozytorium. Aby opublikować stronę, w ustawieniach repozytorium wybierz **Pages → Deploy from a branch → main → /(root)**. Każda kolejna zmiana w gałęzi `main` zostanie opublikowana automatycznie.

## Uruchomienie lokalne

W wersji źródłowej pliki aplikacji znajdują się w katalogu `dist`. Ze względu na mechanizm pracy offline aplikację należy otwierać przez serwer HTTP/HTTPS, nie bezpośrednio jako plik.
