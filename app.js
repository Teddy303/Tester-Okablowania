(() => {
  "use strict";

  const STORAGE_KEY = "bp-tester-okablowania:v1";
  const BACKUP_VERSION = 2;
  const STATUS_LABELS = {
    pending: "Nie sprawdzono",
    ok: "OK",
    error: "Błąd",
    unmade: "Gniazdko niezarobione"
  };

  const ranges = [
    { start: 1, end: 99, label: "0001–0099", floor: "Parter" },
    { start: 1001, end: 1140, label: "1001–1140", floor: "Piętro 1" },
    { start: 2001, end: 2140, label: "2001–2140", floor: "Piętro 2" },
    { start: 3001, end: 3140, label: "3001–3140", floor: "Piętro 3" }
  ];

  const numbers = ranges.flatMap((range) =>
    Array.from({ length: range.end - range.start + 1 }, (_, offset) =>
      String(range.start + offset).padStart(4, "0")
    )
  );
  const numberIndex = new Map(numbers.map((number, index) => [number, index]));

  const defaultState = () => ({
    version: BACKUP_VERSION,
    currentIndex: 0,
    records: {},
    floorEnds: {},
    settings: { project: "", tester: "" }
  });

  let state = loadState();
  let activeView = "test";
  let activeFilter = "all";
  let toastTimer = null;
  let actionLocked = false;
  let deferredInstallPrompt = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    checkedCount: $("#checkedCount"),
    totalCount: $("#totalCount"),
    progressBar: $("#progressBar"),
    progressTrack: $(".progress-track"),
    okCount: $("#okCount"),
    errorCount: $("#errorCount"),
    unmadeCount: $("#unmadeCount"),
    currentNumber: $("#currentNumber"),
    rangeLabel: $("#rangeLabel"),
    currentStatus: $("#currentStatus"),
    currentNote: $("#currentNote"),
    floorEndButton: $("#floorEndButton"),
    floorEndHelp: $("#floorEndHelp"),
    previousButton: $("#previousButton"),
    actionButtons: $$(".action-button"),
    resultsSearch: $("#resultsSearch"),
    resultsList: $("#resultsList"),
    resultsAmount: $("#resultsAmount"),
    errorDialog: $("#errorDialog"),
    errorNumber: $("#errorNumber"),
    errorDescription: $("#errorDescription"),
    customErrorPanel: $("#customErrorPanel"),
    customErrorButton: $('[data-error-choice="custom"]'),
    jumpDialog: $("#jumpDialog"),
    jumpInput: $("#jumpInput"),
    jumpError: $("#jumpError"),
    settingsDialog: $("#settingsDialog"),
    projectName: $("#projectName"),
    testerName: $("#testerName"),
    installDialog: $("#installDialog"),
    restoreInput: $("#restoreInput"),
    toast: $("#toast")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return defaultState();
      const clean = defaultState();
      clean.currentIndex = Number.isInteger(saved.currentIndex)
        ? Math.min(Math.max(saved.currentIndex, 0), numbers.length - 1)
        : 0;
      clean.settings.project = String(saved.settings?.project || "").slice(0, 100);
      clean.settings.tester = String(saved.settings?.tester || "").slice(0, 80);

      Object.entries(saved.floorEnds || {}).forEach(([rangeStart, rangeEnd]) => {
        const range = ranges.find((item) => String(item.start) === String(rangeStart));
        const numericEnd = Number(rangeEnd);
        if (range && Number.isInteger(numericEnd) && numericEnd >= range.start && numericEnd <= range.end) {
          clean.floorEnds[String(range.start)] = numericEnd;
        }
      });

      Object.entries(saved.records || {}).forEach(([number, record]) => {
        if (!numberIndex.has(number) || !["ok", "error", "unmade"].includes(record?.status)) return;
        clean.records[number] = {
          status: record.status,
          note: String(record.note || "").slice(0, 300),
          testedAt: isValidDate(record.testedAt) ? record.testedAt : new Date().toISOString()
        };
      });
      return clean;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast("Nie udało się zapisać danych. Pobierz kopię wyników.");
    }
  }

  function isValidDate(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  }

  function currentNumber() {
    return numbers[state.currentIndex];
  }

  function getRange(number) {
    const numeric = Number(number);
    return ranges.find((range) => numeric >= range.start && numeric <= range.end);
  }

  function getRangeEnd(range) {
    return state.floorEnds[String(range.start)] ?? range.end;
  }

  function getReportNumbers() {
    return ranges.flatMap((range) =>
      Array.from({ length: getRangeEnd(range) - range.start + 1 }, (_, offset) =>
        String(range.start + offset).padStart(4, "0")
      )
    );
  }

  function ensureCurrentIsIncluded() {
    const number = currentNumber();
    const range = getRange(number);
    if (Number(number) <= getRangeEnd(range)) return;
    const rangeEndNumber = String(getRangeEnd(range)).padStart(4, "0");
    state.currentIndex = numberIndex.get(rangeEndNumber);
    saveState();
  }

  function getCounts(scope = getReportNumbers()) {
    const counts = { ok: 0, error: 0, unmade: 0, checked: 0, pending: 0 };
    scope.forEach((number) => {
      const status = state.records[number]?.status;
      if (status && Object.hasOwn(counts, status)) counts[status] += 1;
    });
    counts.checked = counts.ok + counts.error + counts.unmade;
    counts.pending = scope.length - counts.checked;
    return counts;
  }

  function render() {
    ensureCurrentIsIncluded();
    renderProgress();
    renderCurrent();
    if (activeView === "results") renderResults();
    if (activeView === "report") renderReport();
  }

  function renderProgress() {
    const reportNumbers = getReportNumbers();
    const counts = getCounts(reportNumbers);
    const progress = Math.round((counts.checked / reportNumbers.length) * 1000) / 10;
    els.checkedCount.textContent = counts.checked;
    els.totalCount.textContent = reportNumbers.length;
    els.okCount.textContent = counts.ok;
    els.errorCount.textContent = counts.error;
    els.unmadeCount.textContent = counts.unmade;
    els.progressBar.style.width = `${progress}%`;
    els.progressTrack.setAttribute("aria-valuemax", String(reportNumbers.length));
    els.progressTrack.setAttribute("aria-valuenow", String(counts.checked));
  }

  function renderCurrent() {
    const number = currentNumber();
    const numericNumber = Number(number);
    const range = getRange(number);
    const configuredEnd = state.floorEnds[String(range.start)];
    const isConfiguredEnd = configuredEnd === numericNumber;
    const record = state.records[number];
    const status = record?.status || "pending";
    els.currentNumber.textContent = number;
    els.rangeLabel.textContent = configuredEnd
      ? `${range.floor} • do ${String(configuredEnd).padStart(4, "0")}`
      : `${range.floor} • ${range.label}`;
    els.currentStatus.className = `current-status ${status}`;
    els.currentStatus.querySelector("span:last-child").textContent = STATUS_LABELS[status];
    els.previousButton.disabled = getReportNumbers().indexOf(number) === 0;
    els.floorEndButton.setAttribute("aria-pressed", String(isConfiguredEnd));
    els.floorEndHelp.textContent = isConfiguredEnd
      ? `Raport dla: ${range.floor} kończy się na ${number} — dotknij, aby cofnąć`
      : `Zakończ raport dla: ${range.floor} na numerze ${number}`;

    if (record?.note) {
      els.currentNote.textContent = record.note;
      els.currentNote.hidden = false;
    } else {
      els.currentNote.textContent = "";
      els.currentNote.hidden = true;
    }
  }

  function markCurrent(status, note = "") {
    if (actionLocked) return;
    actionLocked = true;
    const number = currentNumber();
    state.records[number] = {
      status,
      note: String(note).trim().slice(0, 300),
      testedAt: new Date().toISOString()
    };
    saveState();
    showToast(`${number} — ${STATUS_LABELS[status]}`);
    advance(true);
    els.actionButtons.forEach((button) => { button.disabled = true; });
    window.setTimeout(() => {
      actionLocked = false;
      els.actionButtons.forEach((button) => { button.disabled = false; });
    }, 330);
  }

  function advance(afterSave = false) {
    const reportNumbers = getReportNumbers();
    const activePosition = reportNumbers.indexOf(currentNumber());
    if (activePosition >= 0 && activePosition < reportNumbers.length - 1) {
      state.currentIndex = numberIndex.get(reportNumbers[activePosition + 1]);
    } else {
      const firstPending = reportNumbers.find((number) => !state.records[number]);
      if (firstPending) {
        state.currentIndex = numberIndex.get(firstPending);
        if (!afterSave) showToast("Koniec listy — pierwszy niesprawdzony numer.");
      } else if (!afterSave) {
        showToast("Wszystkie gniazdka są już sprawdzone.");
      }
    }
    saveState();
    render();
  }

  function goPrevious() {
    const reportNumbers = getReportNumbers();
    const activePosition = reportNumbers.indexOf(currentNumber());
    if (activePosition <= 0) return;
    state.currentIndex = numberIndex.get(reportNumbers[activePosition - 1]);
    saveState();
    render();
  }

  function toggleFloorEnd() {
    const number = currentNumber();
    const numericNumber = Number(number);
    const range = getRange(number);
    const key = String(range.start);
    const configuredEnd = state.floorEnds[key];

    if (configuredEnd === numericNumber) {
      const confirmed = window.confirm(
        `Cofnąć oznaczenie końca dla: ${range.floor}? Raport ponownie obejmie pełny zakres ${range.label}.`
      );
      if (!confirmed) return;
      delete state.floorEnds[key];
      saveState();
      render();
      showToast(`${range.floor} — przywrócono pełny zakres.`);
      return;
    }

    const skippedCount = range.end - numericNumber;
    const hiddenResults = numbers.filter((item) => {
      const value = Number(item);
      return value > numericNumber && value <= range.end && state.records[item];
    }).length;
    const hiddenInfo = hiddenResults
      ? ` Zapisane wyniki powyżej tej granicy (${hiddenResults}) zostaną ukryte, ale nie usunięte.`
      : "";
    const skippedText = skippedCount === 1
      ? "1 dalszy numer nie będzie liczony ani raportowany."
      : skippedCount % 10 >= 2 && skippedCount % 10 <= 4 && !(skippedCount % 100 >= 12 && skippedCount % 100 <= 14)
        ? `${skippedCount} dalsze numery nie będą liczone ani raportowane.`
        : `${skippedCount} dalszych numerów nie będzie liczonych ani raportowanych.`;
    const confirmed = window.confirm(
      `${number} będzie ostatnim numerem w raporcie dla: ${range.floor}. `
      + `${skippedText}${hiddenInfo}`
    );
    if (!confirmed) return;

    state.floorEnds[key] = numericNumber;
    saveState();
    render();
    showToast(`${range.floor} — raport kończy się na ${number}.`);
  }

  function goToNumber(number) {
    const normalized = String(number).trim().padStart(4, "0");
    const index = numberIndex.get(normalized);
    if (index === undefined) return "missing";
    if (!getReportNumbers().includes(normalized)) return "excluded";
    state.currentIndex = index;
    saveState();
    setView("test");
    render();
    return "ok";
  }

  function setView(view) {
    activeView = view;
    $$(".view").forEach((section) => {
      const isActive = section.id === `${view}View`;
      section.hidden = !isActive;
      section.classList.toggle("active", isActive);
    });
    $$(".bottom-nav button").forEach((button) => {
      if (button.dataset.view === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderResults() {
    const query = els.resultsSearch.value.trim().toLocaleLowerCase("pl");
    const filtered = getReportNumbers().filter((number) => {
      const record = state.records[number];
      const status = record?.status || "pending";
      const matchesFilter = activeFilter === "all"
        || (activeFilter === "issues" && ["error", "unmade"].includes(status))
        || activeFilter === status;
      const searchable = `${number} ${record?.note || ""} ${STATUS_LABELS[status]}`.toLocaleLowerCase("pl");
      return matchesFilter && searchable.includes(query);
    });

    els.resultsAmount.textContent = `${filtered.length} ${pluralize(filtered.length, "pozycja", "pozycje", "pozycji")}`;
    if (!filtered.length) {
      els.resultsList.innerHTML = '<div class="empty-results">Brak wyników pasujących do filtra.</div>';
      return;
    }

    els.resultsList.innerHTML = filtered.map((number) => {
      const record = state.records[number];
      const status = record?.status || "pending";
      const detail = record?.note
        ? escapeHtml(record.note)
        : record?.testedAt
          ? formatDateTime(record.testedAt)
          : "Dotknij, aby przejść do testu";
      const shortLabel = status === "unmade" ? "Niezar." : STATUS_LABELS[status];
      return `
        <button class="result-row" type="button" data-number="${number}" data-status="${status}">
          <span class="result-number">${number}</span>
          <span class="result-detail"><strong>${escapeHtml(STATUS_LABELS[status])}</strong><small>${detail}</small></span>
          <span class="result-status">${escapeHtml(shortLabel)}</span>
        </button>`;
    }).join("");
  }

  function renderReport() {
    const counts = getCounts();
    $("#reportChecked").textContent = counts.checked;
    $("#reportOk").textContent = counts.ok;
    $("#reportErrors").textContent = counts.error;
    $("#reportUnmade").textContent = counts.unmade;
    const fewRemaining = counts.pending % 10 >= 2 && counts.pending % 10 <= 4
      && !(counts.pending % 100 >= 12 && counts.pending % 100 <= 14);
    $("#reportPending").textContent = counts.pending === 0
      ? "Wszystkie gniazdka zostały sprawdzone."
      : counts.pending === 1
        ? "Do sprawdzenia pozostało 1 gniazdko."
        : `Do sprawdzenia ${fewRemaining ? "pozostały" : "pozostało"} ${counts.pending} ${pluralize(counts.pending, "gniazdko", "gniazdka", "gniazdek")}.`;
    $("#reportRanges").innerHTML = ranges.map((range) => {
      const end = getRangeEnd(range);
      const manuallyEnded = state.floorEnds[String(range.start)] !== undefined;
      return `<span><b>${escapeHtml(range.floor)}</b>${String(range.start).padStart(4, "0")}–${String(end).padStart(4, "0")}${manuallyEnded ? " <em>• ostatni</em>" : ""}</span>`;
    }).join("");
  }

  function openErrorDialog() {
    const number = currentNumber();
    els.errorNumber.textContent = number;
    els.errorDescription.value = "";
    els.customErrorPanel.hidden = true;
    els.customErrorButton.setAttribute("aria-expanded", "false");
    els.errorDialog.showModal();
    window.setTimeout(() => els.errorDialog.querySelector("[data-error-choice]").focus(), 50);
  }

  function openJumpDialog() {
    els.jumpInput.value = currentNumber();
    els.jumpError.hidden = true;
    els.jumpDialog.showModal();
    window.setTimeout(() => {
      els.jumpInput.focus();
      els.jumpInput.select();
    }, 50);
  }

  function openSettingsDialog() {
    els.projectName.value = state.settings.project;
    els.testerName.value = state.settings.tester;
    els.settingsDialog.showModal();
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  function buildReportHtml() {
    const reportNumbers = getReportNumbers();
    const counts = getCounts(reportNumbers);
    const now = new Date();
    const title = state.settings.project || "Kontrola okablowania strukturalnego";
    const rangesDescription = ranges.map((range) =>
      `${range.floor}: ${String(range.start).padStart(4, "0")}–${String(getRangeEnd(range)).padStart(4, "0")}`
    ).join(" • ");

    const floorSections = ranges.map((range) => {
      const rangeEnd = getRangeEnd(range);
      const floorNumbers = reportNumbers.filter((number) => {
        const numeric = Number(number);
        return numeric >= range.start && numeric <= rangeEnd;
      });
      const floorCounts = getCounts(floorNumbers);
      const manuallyEnded = state.floorEnds[String(range.start)] !== undefined;
      const rows = floorNumbers.map((number, index) => {
        const record = state.records[number];
        const status = record?.status || "pending";
        const statusClass = status === "pending" ? "" : status;
        return `<tr class="${statusClass}">
          <td>${index + 1}</td>
          <td class="num">${number}</td>
          <td><strong>${escapeHtml(STATUS_LABELS[status])}</strong></td>
          <td>${escapeHtml(record?.note || "")}</td>
          <td>${record?.testedAt ? escapeHtml(formatDateTime(record.testedAt)) : "—"}</td>
        </tr>`;
      }).join("");

      return `<section class="floor-report">
        <div class="floor-head">
          <div><span>RAPORT PIĘTRA</span><h2>${escapeHtml(range.floor)}</h2></div>
          <div class="floor-range">${String(range.start).padStart(4, "0")}–${String(rangeEnd).padStart(4, "0")}<small>${manuallyEnded ? `Ostatni numer: ${String(rangeEnd).padStart(4, "0")}` : "Pełny zakres"}</small></div>
        </div>
        <div class="floor-summary">
          <span>Punktów <strong>${floorNumbers.length}</strong></span>
          <span>Sprawdzono <strong>${floorCounts.checked}</strong></span>
          <span>OK <strong>${floorCounts.ok}</strong></span>
          <span>Błędy <strong>${floorCounts.error}</strong></span>
          <span>Niezarobione <strong>${floorCounts.unmade}</strong></span>
          <span>Niesprawdzone <strong>${floorCounts.pending}</strong></span>
        </div>
        <table><thead><tr><th>Lp.</th><th>Numer</th><th>Wynik</th><th>Opis</th><th>Data i godzina</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="signatures"><div class="signature">Podpis osoby testującej</div><div class="signature">Podpis odbierającego</div></div>
      </section>`;
    }).join("");

    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Raport — ${escapeHtml(title)}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #152238; font-family: Arial, sans-serif; font-size: 9pt; }
        header { padding-bottom: 10mm; border-bottom: 3px solid #1769e0; }
        h1 { margin: 0 0 4px; font-size: 20pt; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-top: 8px; color: #44536a; }
        .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin: 8mm 0; }
        .summary div { padding: 8px; border: 1px solid #d9e0e9; border-radius: 5px; }
        .summary span { display: block; color: #67758a; font-size: 7.5pt; }
        .summary strong { display: block; margin-top: 2px; font-size: 14pt; }
        .floor-report { margin-top: 9mm; }
        .floor-report + .floor-report { break-before: page; page-break-before: always; }
        .floor-head { display: flex; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 2px solid #1769e0; align-items: flex-end; justify-content: space-between; }
        .floor-head span { color: #1769e0; font-size: 7pt; font-weight: 700; letter-spacing: .12em; }
        .floor-head h2 { margin: 1px 0 0; font-size: 17pt; }
        .floor-range { font-size: 13pt; font-weight: 700; text-align: right; }
        .floor-range small { display: block; margin-top: 2px; color: #67758a; font-size: 7.5pt; font-weight: 400; }
        .floor-summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 4mm; }
        .floor-summary span { padding: 5px; border: 1px solid #dfe5ec; border-radius: 4px; color: #67758a; font-size: 7pt; }
        .floor-summary strong { display: block; margin-top: 1px; color: #152238; font-size: 10pt; }
        table { width: 100%; border-collapse: collapse; }
        th { padding: 6px 5px; color: #fff; background: #10243f; text-align: left; font-size: 8pt; }
        td { padding: 5px; border-bottom: 1px solid #dfe5ec; vertical-align: top; }
        tr.error td { background: #ffeaec; }
        tr.unmade td { background: #fff3d8; }
        tr.ok td:nth-child(3) { color: #087a4d; }
        .num { font-weight: 700; font-variant-numeric: tabular-nums; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20mm; margin-top: 14mm; page-break-inside: avoid; }
        .signature { padding-top: 15mm; border-bottom: 1px solid #7b8797; color: #67758a; text-align: center; font-size: 8pt; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        @media print { .no-print { display: none !important; } }
      </style></head><body>
      <header>
        <h1>Raport kontroli okablowania</h1>
        <div><strong>${escapeHtml(title)}</strong></div>
        <div class="meta"><span>Osoba testująca: <strong>${escapeHtml(state.settings.tester || "—")}</strong></span><span>Wygenerowano: <strong>${escapeHtml(formatDateTime(now.toISOString()))}</strong></span><span>Zakresy raportu: ${escapeHtml(rangesDescription)}</span><span>Łącznie: ${reportNumbers.length} punktów</span></div>
      </header>
      <section class="summary">
        <div><span>Sprawdzone</span><strong>${counts.checked}</strong></div>
        <div><span>OK</span><strong>${counts.ok}</strong></div>
        <div><span>Błędy</span><strong>${counts.error}</strong></div>
        <div><span>Niezarobione</span><strong>${counts.unmade}</strong></div>
        <div><span>Niesprawdzone</span><strong>${counts.pending}</strong></div>
      </section>
      ${floorSections}
      </body></html>`;
  }

  function openPrintReport() {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      showToast("Przeglądarka zablokowała raport. Zezwól na otwieranie nowych kart.");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(buildReportHtml());
    reportWindow.document.close();
    window.setTimeout(() => {
      reportWindow.focus();
      reportWindow.print();
    }, 450);
  }

  function exportCsv() {
    const header = ["Lp.", "Piętro", "Numer", "Zakres raportu", "Wynik", "Opis błędu", "Data", "Godzina", "Obiekt", "Osoba testująca"];
    const rows = getReportNumbers().map((number, index) => {
      const record = state.records[number];
      const status = record?.status || "pending";
      const date = record?.testedAt ? new Date(record.testedAt) : null;
      const range = getRange(number);
      return [
        index + 1,
        range.floor,
        `="${number}"`,
        `${String(range.start).padStart(4, "0")}–${String(getRangeEnd(range)).padStart(4, "0")}`,
        STATUS_LABELS[status],
        record?.note || "",
        date ? date.toLocaleDateString("pl-PL") : "",
        date ? date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "",
        state.settings.project,
        state.settings.tester
      ];
    });
    const csv = "\ufeffsep=;\r\n" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    downloadBlob(csv, "text/csv;charset=utf-8", `${fileBaseName()}_${dateStamp()}.csv`);
    showToast("Raport Excel / CSV został przygotowany.");
  }

  function exportBackup() {
    const backup = {
      application: "Tester okablowania",
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      ranges,
      state
    };
    downloadBlob(JSON.stringify(backup, null, 2), "application/json", `${fileBaseName()}_kopia_${dateStamp()}.json`);
    showToast("Kopia danych została pobrana.");
  }

  async function restoreBackup(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const restored = parsed?.state;
      if (!restored || typeof restored.records !== "object") throw new Error("invalid");
      const candidate = defaultState();
      candidate.currentIndex = Number.isInteger(restored.currentIndex)
        ? Math.min(Math.max(restored.currentIndex, 0), numbers.length - 1)
        : 0;
      candidate.settings.project = String(restored.settings?.project || "").slice(0, 100);
      candidate.settings.tester = String(restored.settings?.tester || "").slice(0, 80);
      Object.entries(restored.floorEnds || {}).forEach(([rangeStart, rangeEnd]) => {
        const range = ranges.find((item) => String(item.start) === String(rangeStart));
        const numericEnd = Number(rangeEnd);
        if (range && Number.isInteger(numericEnd) && numericEnd >= range.start && numericEnd <= range.end) {
          candidate.floorEnds[String(range.start)] = numericEnd;
        }
      });
      Object.entries(restored.records).forEach(([number, record]) => {
        if (!numberIndex.has(number) || !["ok", "error", "unmade"].includes(record?.status)) return;
        candidate.records[number] = {
          status: record.status,
          note: String(record.note || "").slice(0, 300),
          testedAt: isValidDate(record.testedAt) ? record.testedAt : new Date().toISOString()
        };
      });
      if (!window.confirm(`Wczytać kopię zawierającą ${Object.keys(candidate.records).length} wyników? Obecne dane zostaną zastąpione.`)) return;
      state = candidate;
      saveState();
      render();
      showToast("Kopia danych została wczytana.");
    } catch {
      showToast("Nie udało się wczytać kopii. Sprawdź wybrany plik.");
    } finally {
      els.restoreInput.value = "";
    }
  }

  function resetMeasurement() {
    const counts = getCounts();
    if ((counts.checked > 0 || Object.keys(state.floorEnds).length > 0)
      && !window.confirm(`Usunąć wszystkie ${counts.checked} zapisane wyniki oraz oznaczenia końców pięter i rozpocząć nowy pomiar? Tej operacji nie można cofnąć.`)) return;
    state.records = {};
    state.floorEnds = {};
    state.currentIndex = 0;
    saveState();
    setView("test");
    showToast("Rozpoczęto nowy pomiar.");
  }

  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function fileBaseName() {
    const base = state.settings.project || "raport_okablowania";
    return base.toLocaleLowerCase("pl")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "raport_okablowania";
  }

  function dateStamp() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text) && !/^="\d{4}"$/.test(text)) text = `'${text}`;
    text = text.replace(/"/g, '""');
    return `"${text}"`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat("pl-PL", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function pluralize(value, one, few, many) {
    if (value === 1) return one;
    const lastTwo = value % 100;
    const last = value % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
    return many;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  $("#okButton").addEventListener("click", () => markCurrent("ok"));
  $("#errorButton").addEventListener("click", openErrorDialog);
  $("#unmadeButton").addEventListener("click", () => markCurrent("unmade"));
  $("#nextButton").addEventListener("click", () => advance(false));
  $("#smallNextButton").addEventListener("click", () => advance(false));
  els.previousButton.addEventListener("click", goPrevious);
  els.floorEndButton.addEventListener("click", toggleFloorEnd);
  $("#numberButton").addEventListener("click", openJumpDialog);
  $("#settingsButton").addEventListener("click", openSettingsDialog);

  $$(".bottom-nav button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $("#errorForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const note = els.errorDescription.value.trim();
    if (!note) {
      els.errorDescription.focus();
      return;
    }
    closeDialog("errorDialog");
    markCurrent("error", note);
  });

  $$("[data-error-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const choice = button.dataset.errorChoice;
      if (choice === "custom") {
        els.customErrorPanel.hidden = false;
        els.customErrorButton.setAttribute("aria-expanded", "true");
        window.setTimeout(() => els.errorDescription.focus(), 50);
        return;
      }
      closeDialog("errorDialog");
      markCurrent("error", choice);
    });
  });

  $("#jumpForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = goToNumber(els.jumpInput.value);
    if (result === "ok") {
      closeDialog("jumpDialog");
      return;
    }
    els.jumpError.textContent = result === "excluded"
      ? "Ten numer znajduje się poza oznaczonym końcem piętra. Najpierw cofnij oznaczenie ostatniego numeru."
      : "Ten numer nie występuje na liście.";
    els.jumpError.hidden = false;
    els.jumpInput.focus();
    els.jumpInput.select();
  });

  $$("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      els.jumpInput.value = button.dataset.jump;
      els.jumpError.hidden = true;
    });
  });

  els.jumpInput.addEventListener("input", () => {
    els.jumpInput.value = els.jumpInput.value.replace(/\D/g, "").slice(0, 4);
    els.jumpError.hidden = true;
  });

  $("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings.project = els.projectName.value.trim();
    state.settings.tester = els.testerName.value.trim();
    saveState();
    closeDialog("settingsDialog");
    showToast("Ustawienia pomiaru zapisane.");
  });

  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });

  $$(".app-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  $("#filterRow").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    activeFilter = button.dataset.filter;
    $$("#filterRow button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    renderResults();
  });

  els.resultsSearch.addEventListener("input", renderResults);
  els.resultsList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-number]");
    if (row) goToNumber(row.dataset.number);
  });

  $("#printButton").addEventListener("click", openPrintReport);
  $("#csvButton").addEventListener("click", exportCsv);
  $("#backupButton").addEventListener("click", exportBackup);
  els.restoreInput.addEventListener("change", () => {
    const [file] = els.restoreInput.files;
    if (file) restoreBackup(file);
  });
  $("#resetButton").addEventListener("click", resetMeasurement);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  $("#installButton").addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    } else {
      els.installDialog.showModal();
    }
  });

  if ("serviceWorker" in navigator) {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  render();
})();
