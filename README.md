# Tester okablowania

Mobilna aplikacja PWA do zapisywania wyników kontroli połączeń patchpanel–gniazdo. Jest przystosowana do używania na telefonie i po pierwszym uruchomieniu może działać również bez internetu.

Docelowy adres GitHub Pages: <https://teddy303.github.io/Tester-Okablowania/>

Zakresy numerów:

- 0001–0099
- 1001–1140
- 2001–2140
- 3001–3140

Dane pomiarowe są przechowywane lokalnie w przeglądarce urządzenia. Dla każdego piętra można wskazać ostatni wykorzystany numer; dalsze numery z tego zakresu nie są wtedy liczone ani umieszczane w raporcie. Przy błędzie można wybrać uszkodzony kabel, błędnie zakończone gniazdko, błędnie zakończony keystone albo wpisać własny opis. Aplikacja generuje raport do wydruku/PDF, eksport CSV zgodny z Excelem oraz kopię bezpieczeństwa JSON.

Pojedynczy wynik można usunąć przyciskiem **Usuń zapis** widocznym przy aktualnym gniazdku. Numer pozostaje w raporcie jako **Nie sprawdzono**, bez poprzedniego wyniku, opisu i daty.

W ustawieniach znajduje się konfigurator obiektu. Pozwala wybrać liczbę kondygnacji, osobną liczbę gniazdek na każdej kondygnacji oraz jeden z dwóch sposobów numeracji: czterocyfrowy (`0001`, `1001`, `2001`…) albo piętro i gniazdko (`P0 S1`, `P1 S1`, `P2 S1`…). Zmiana konfiguracji nie kasuje wcześniejszych wyników; wyniki niepasujące do nowego układu pozostają zachowane i wracają po przywróceniu poprzedniej numeracji.

## Ponowne testowanie po naprawach

W zakładce **Test** wybierz **Tylko błędy** lub **Tylko niezarobione**. Te same grupy można otworzyć przyciskami **Sprawdź błędy** i **Sprawdź niezarobione** w zakładce **Raport**.

- Strzałki przechodzą wyłącznie po gniazdkach o wybranym statusie, w kolejności numeracji obiektu.
- Zapis zastępuje wcześniejszy wynik, opis i datę danego gniazdka w pełnym raporcie. Zapisanie **OK** usuwa gniazdko z listy napraw; zmiana niezarobionego na **Błąd** przenosi je do grupy błędów.
- **Następny** niczego nie zmienia. Jeśli gniazdko nadal ma wybrany status, zostaje na liście; po dojściu do jej końca można wrócić do początku.
- Pusta grupa pokazuje osobny komunikat, bez aktywnych przycisków zapisu. Nie oznacza to automatycznie, że wszystkie gniazda w obiekcie są OK.
- Tryb testowania i bieżący numer są zapamiętywane na tym urządzeniu. Filtr nie zmienia zakresu raportu PDF/CSV ani kopii JSON.
- W trybie napraw ukryte jest **Ostatnie na piętrze**, aby nie pomylić końca listy napraw z końcem fizycznego piętra.

## Dodawanie gniazdek

W ustawieniach zwiększ liczbę gniazdek na wybranym piętrze, pozostawiając dotychczasowy sposób numeracji. Nowe numery pojawią się jako **Nie sprawdzono**, bez utraty wcześniejszych wyników. Jeśli raport ogranicza oznaczenie **Ostatnie na piętrze**, cofnij je w trybie **Wszystkie**. Nowe niesprawdzone numery nie pojawiają się w grupie błędów ani niezarobionych.

## Trwałość danych

- Zamknięcie aplikacji lub ponowne uruchomienie telefonu nie usuwa wyników.
- Wyniki należą do konkretnej przeglądarki i konkretnego adresu strony.
- Wyczyszczenie danych przeglądarki może je usunąć, dlatego warto regularnie wybierać **Raport → Pobierz kopię**.
- Po zmianie adresu strony należy pobrać kopię JSON pod starym adresem, a następnie wybrać **Wczytaj kopię** pod nowym adresem.

## GitHub Pages

Pliki aplikacji są umieszczone w katalogu głównym repozytorium. Aby opublikować stronę, w ustawieniach repozytorium wybierz **Pages → Deploy from a branch → main → /(root)**. Każda kolejna zmiana w gałęzi `main` zostanie opublikowana automatycznie.

## Uruchomienie lokalne

W wersji źródłowej pliki aplikacji znajdują się w katalogu `dist`. Ze względu na mechanizm pracy offline aplikację należy otwierać przez serwer HTTP/HTTPS, nie bezpośrednio jako plik.
