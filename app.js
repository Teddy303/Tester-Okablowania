(() => {
  "use strict";

  const STORAGE_KEY = "bp-tester-okablowania:v1";
  const BACKUP_VERSION = 3;
  const STATUS_LABELS = {
    pending: "Nie sprawdzono",
    ok: "OK",
    error: "Błąd",
    unmade: "Gniazdko niezarobione"
  };

  const DEFAULT_CONFIG = {
    numbering: "numeric",
    startFloor: 0,
    floors: [{ count: 99 }, { count: 140 }, { count: 140 }, { count: 140 }]
  };

  let ranges = [];
  let numbers = [];
  let numberIndex = new Map();
  let rangeByNumber = new Map();

  function cloneDefaultConfig() {
    return {
      numbering: DEFAULT_CONFIG.numbering,
      startFloor: DEFAULT_CONFIG.startFloor,
      floors: DEFAULT_CONFIG.floors.map((floor) => ({ count: floor.count }))
    };
  }

  function sanitizeConfig(value) {
    const source = value && typeof value === "object" ? value : cloneDefaultConfig();
    const numbering = source.numbering === "floorSocket" ? "floorSocket" : "numeric";
    const startFloor = Number(source.startFloor) === 1 ? 1 : 0;
    const maxFloors = 10 - startFloor;
    const rawFloors = Array.isArray(source.floors) && source.floors.length
      ? source.floors.slice(0, maxFloors)
      : cloneDefaultConfig().floors;
    const floors = rawFloors.map((floor) => ({
      count: Math.min(999, Math.max(1, Number.parseInt(floor?.count ?? floor, 10) || 1))
    }));
    return { numbering, startFloor, floors };
  }

  function floorName(level) {
    return level === 0 ? "Parter" : `Piętro ${level}`;
  }

  function socketLabel(numbering, level, socket) {
    return numbering === "floorSocket"
      ? `P${level} S${socket}`
      : String((level * 1000) + socket).padStart(4, "0");
  }

  function buildStructure(config) {
    return config.floors.map((floor, index) => {
      const level = config.startFloor + index;
      const floorNumbers = Array.from({ length: floor.count }, (_, offset) =>
        socketLabel(config.numbering, level, offset + 1)
      );
      return {
        id: `floor-${level}`,
        level,
        floor: floorName(level),
        count: floor.count,
        numbers: floorNumbers,
        start: floorNumbers[0],
        end: floorNumbers[floorNumbers.length - 1],
        label: `${floorNumbers[0]}–${floorNumbers[floorNumbers.length - 1]}`
      };
    });
  }

  function rebuildStructure(config) {
    ranges = buildStructure(config);
    numbers = ranges.flatMap((range) => range.numbers);
    numberIndex = new Map(numbers.map((number, index) => [number, index]));
    rangeByNumber = new Map(ranges.flatMap((range) => range.numbers.map((number) => [number, range])));
    document?.body?.setAttribute("data-numbering", config.numbering);
  }

  const defaultState = () => ({
    version: BACKUP_VERSION,
    currentIndex: 0,
    testFilter: "all",
    records: {},
    floorEnds: {},
    config: cloneDefaultConfig(),
    settings: { project: "", tester: "" }
  });

  let state = loadState();
  let activeView = "test";
  let activeFilter = "all";
  let toastTimer = null;
  let actionLocked = false;
  let deferredInstallPrompt = null;
  let configDraft = null;

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
    testScope: $("#testScope"),
    testScopeCount: $("#testScopeCount"),
    testWorkspace: $("#testWorkspace"),
    emptyTestScope: $("#emptyTestScope"),
    emptyTestScopeTitle: $("#emptyTestScopeTitle"),
    testFlowHint: $("#testFlowHint"),
    deleteRecordButton: $("#deleteRecordButton"),
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
    rangeShortcuts: $("#rangeShortcuts"),
    settingsDialog: $("#settingsDialog"),
    projectName: $("#projectName"),
    testerName: $("#testerName"),
    numberingMode: $("#numberingMode"),
    startFloor: $("#startFloor"),
    floorCount: $("#floorCount"),
    floorConfigRows: $("#floorConfigRows"),
    configTotal: $("#configTotal"),
    configWarning: $("#configWarning"),
    installDialog: $("#installDialog"),
    restoreInput: $("#restoreInput"),
    toast: $("#toast")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") {
        const fresh = defaultState();
        rebuildStructure(fresh.config);
        return fresh;
      }
      const clean = defaultState();
      clean.config = sanitizeConfig(saved.config);
      clean.testFilter = normalizeTestFilter(saved.testFilter);
      rebuildStructure(clean.config);
      clean.currentIndex = Number.isInteger(saved.currentIndex)
        ? Math.min(Math.max(saved.currentIndex, 0), numbers.length - 1)
        : 0;
      clean.settings.project = String(saved.settings?.project || "").slice(0, 100);
      clean.settings.tester = String(saved.settings?.tester || "").slice(0, 80);

      ranges.forEach((range) => {
        const legacyKey = clean.config.numbering === "numeric" ? String(Number(range.start)) : null;
        const rawEnd = saved.floorEnds?.[range.id] ?? (legacyKey ? saved.floorEnds?.[legacyKey] : undefined);
        const directEnd = String(rawEnd ?? "");
        const migratedEnd = range.numbers.includes(directEnd)
          ? directEnd
          : clean.config.numbering === "numeric"
            ? range.numbers.find((number) => Number(number) === Number(rawEnd))
            : undefined;
        if (migratedEnd) clean.floorEnds[range.id] = migratedEnd;
      });

      Object.entries(saved.records || {}).forEach(([number, record]) => {
        const safeNumber = String(number).trim().slice(0, 40);
        if (!safeNumber || !["ok", "error", "unmade"].includes(record?.status)) return;
        clean.records[safeNumber] = {
          status: record.status,
          note: String(record.note || "").slice(0, 300),
          testedAt: isValidDate(record.testedAt) ? record.testedAt : new Date().toISOString()
        };
      });
      return clean;
    } catch {
      const fresh = defaultState();
      rebuildStructure(fresh.config);
      return fresh;
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
    return rangeByNumber.get(number);
  }

  function getRangeEnd(range) {
    const savedEnd = state.floorEnds[range.id];
    return range.numbers.includes(savedEnd) ? savedEnd : range.end;
  }

  function getRangeNumbers(range) {
    const endIndex = range.numbers.indexOf(getRangeEnd(range));
    return range.numbers.slice(0, endIndex + 1);
  }

  function getReportNumbers() {
    return ranges.flatMap((range) => getRangeNumbers(range));
  }

  function getExportNumbers(scope = "all") {
    const reportNumbers = getReportNumbers();
    if (scope !== "errors") return reportNumbers;
    return reportNumbers.filter((number) => state.records[number]?.status === "error");
  }

  function normalizeTestFilter(value) {
    return ["error", "unmade"].includes(value) ? value : "all";
  }

  // The report scope never changes with the test filter.
  function getTestNumbers() {
    return getReportNumbers().filter((number) =>
      state.testFilter === "all" || state.records[number]?.status === state.testFilter
    );
  }

  function canTestCurrent() {
    return getTestNumbers().includes(currentNumber());
  }

  function setTestFilter(value) {
    state.testFilter = normalizeTestFilter(value);
    const candidates = getTestNumbers();
    if (state.testFilter !== "all" && candidates.length) {
      state.currentIndex = numberIndex.get(candidates[0]);
    }
    saveState();
    setView("test");
  }

  function ensureCurrentIsIncluded() {
    const number = currentNumber();
    if (state.testFilter !== "all") {
      const candidates = getTestNumbers();
      if (!candidates.length || candidates.includes(number)) return;
      const next = candidates.find((item) => numberIndex.get(item) > state.currentIndex) || candidates[0];
      state.currentIndex = numberIndex.get(next);
      saveState();
      return;
    }
    const range = getRange(number);
    if (!range || getRangeNumbers(range).includes(number)) return;
    state.currentIndex = numberIndex.get(getRangeEnd(range));
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
    renderTestScope();
    if (canTestCurrent()) renderCurrent();
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

  function renderTestScope() {
    const candidates = getTestNumbers();
    const hasCurrent = candidates.includes(currentNumber());
    const filtered = state.testFilter !== "all";
    els.testScope.value = state.testFilter;
    els.testScopeCount.textContent = filtered
      ? `W tej grupie: ${candidates.length} ${pluralize(candidates.length, "gniazdko", "gniazdka", "gniazdek")}`
      : `Pełna lista: ${candidates.length} ${pluralize(candidates.length, "gniazdko", "gniazdka", "gniazdek")}`;
    els.testWorkspace.hidden = !hasCurrent;
    els.emptyTestScope.hidden = hasCurrent;
    els.emptyTestScopeTitle.textContent = state.testFilter === "error"
      ? "Brak gniazdek ze statusem Błąd"
      : "Brak gniazdek niezarobionych";
    els.actionButtons.forEach((button) => { button.disabled = actionLocked || !hasCurrent; });
    $("#smallNextButton").disabled = actionLocked || !hasCurrent;
    els.previousButton.disabled = actionLocked || candidates.indexOf(currentNumber()) <= 0;
    els.deleteRecordButton.disabled = actionLocked || !hasCurrent;
    // The last item in a repair list is not necessarily the last socket on a floor.
    els.floorEndButton.hidden = filtered;
    els.testFlowHint.textContent = filtered
      ? "Zapis zastępuje poprzedni wynik w pełnym raporcie. Następny pomija gniazdko bez zmiany wyniku."
      : "Jeśli to ostatnie gniazdko na piętrze, włącz opcję przed zapisaniem wyniku. OK i „niezarobione” od razu przechodzą dalej.";
  }

  function renderCurrent() {
    const number = currentNumber();
    const range = getRange(number);
    const configuredEnd = state.floorEnds[range.id];
    const isConfiguredEnd = configuredEnd === number;
    const record = state.records[number];
    const status = record?.status || "pending";
    els.currentNumber.textContent = number;
    els.rangeLabel.textContent = configuredEnd
      ? `${range.floor} • do ${configuredEnd}`
      : `${range.floor} • ${range.label}`;
    els.currentStatus.className = `current-status ${status}`;
    els.currentStatus.querySelector("span:last-child").textContent = STATUS_LABELS[status];
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
    els.deleteRecordButton.hidden = !record;
  }

  function markCurrent(status, note = "") {
    if (actionLocked || !canTestCurrent()) return;
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
    window.setTimeout(() => {
      actionLocked = false;
      renderTestScope();
    }, 330);
  }

  function deleteCurrentRecord() {
    if (actionLocked || !canTestCurrent()) return;
    const number = currentNumber();
    if (!state.records[number]) return;
    if (!window.confirm(`Usunąć zapis dla gniazdka ${number}? Gniazdko wróci do stanu „Nie sprawdzono”.`)) return;
    delete state.records[number];
    saveState();
    render();
    showToast(`${number} — zapis usunięty.`);
  }

  function advance(afterSave = false) {
    if (actionLocked && !afterSave) return;
    if (state.testFilter !== "all") {
      const candidates = getTestNumbers();
      // Use the full list index: the just-saved item may no longer match the filter.
      const next = candidates.find((number) => numberIndex.get(number) > state.currentIndex);
      if (next) state.currentIndex = numberIndex.get(next);
      else if (candidates.length) {
        state.currentIndex = numberIndex.get(candidates[0]);
        if (!afterSave) showToast("Koniec wybranej listy — wrócono do jej początku.");
      }
      saveState();
      render();
      return;
    }
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
    if (actionLocked) return;
    const reportNumbers = getTestNumbers();
    const activePosition = reportNumbers.indexOf(currentNumber());
    if (activePosition <= 0) return;
    state.currentIndex = numberIndex.get(reportNumbers[activePosition - 1]);
    saveState();
    render();
  }

  function toggleFloorEnd() {
    if (actionLocked || state.testFilter !== "all" || !canTestCurrent()) return;
    const number = currentNumber();
    const range = getRange(number);
    const currentPosition = range.numbers.indexOf(number);
    const key = range.id;
    const configuredEnd = state.floorEnds[key];

    if (configuredEnd === number) {
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

    const skippedCount = range.numbers.length - currentPosition - 1;
    const hiddenResults = range.numbers.slice(currentPosition + 1)
      .filter((item) => state.records[item]).length;
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

    state.floorEnds[key] = number;
    saveState();
    render();
    showToast(`${range.floor} — raport kończy się na ${number}.`);
  }

  function goToNumber(number, fromResults = false) {
    const input = String(number).trim();
    const compact = input.toLocaleUpperCase("pl").replace(/\s+/g, "");
    const normalized = state.config.numbering === "numeric" && /^\d+$/.test(input)
      ? input.padStart(4, "0")
      : numbers.find((item) => item.toLocaleUpperCase("pl").replace(/\s+/g, "") === compact);
    if (!normalized) return "missing";
    const index = numberIndex.get(normalized);
    if (index === undefined) return "missing";
    if (!getReportNumbers().includes(normalized)) return "excluded";
    if (!getTestNumbers().includes(normalized)) {
      if (!fromResults) return "filtered";
      state.testFilter = "all";
      showToast("Wybrane gniazdko jest poza grupą — włączono tryb Wszystkie.");
    }
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
        <button class="result-row" type="button" data-number="${escapeHtml(number)}" data-status="${status}">
          <span class="result-number">${escapeHtml(number)}</span>
          <span class="result-detail"><strong>${escapeHtml(STATUS_LABELS[status])}</strong><small>${detail}</small></span>
          <span class="result-status">${escapeHtml(shortLabel)}</span>
        </button>`;
    }).join("");
  }

  function renderReport() {
    const counts = getCounts();
    $("#errorReportCount").textContent = `Punktów ze statusem Błąd: ${getExportNumbers("errors").length}`;
    $("#retestErrorsButton").textContent = `Sprawdź błędy (${counts.error})`;
    $("#retestErrorsButton").disabled = counts.error === 0;
    $("#retestUnmadeButton").textContent = `Sprawdź niezarobione (${counts.unmade})`;
    $("#retestUnmadeButton").disabled = counts.unmade === 0;
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
      const manuallyEnded = state.floorEnds[range.id] !== undefined;
      return `<span><b>${escapeHtml(range.floor)}</b>${escapeHtml(range.start)}–${escapeHtml(end)}${manuallyEnded ? " <em>• ostatni</em>" : ""}</span>`;
    }).join("");
  }

  function openErrorDialog() {
    if (actionLocked || !canTestCurrent()) return;
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
    els.jumpInput.inputMode = state.config.numbering === "numeric" ? "numeric" : "text";
    els.jumpInput.maxLength = state.config.numbering === "numeric" ? 4 : 20;
    els.jumpInput.placeholder = state.config.numbering === "numeric" ? "np. 2037" : "np. P2 S37";
    const candidates = new Set(getTestNumbers());
    els.rangeShortcuts.innerHTML = ranges.map((range) => range.numbers.find((number) => candidates.has(number)))
      .filter(Boolean).map((number) =>
        `<button type="button" data-jump="${escapeHtml(number)}">${escapeHtml(number)}</button>`
      ).join("");
    els.jumpError.hidden = true;
    els.jumpDialog.showModal();
    window.setTimeout(() => {
      els.jumpInput.focus();
      els.jumpInput.select();
    }, 50);
  }

  function renderFloorConfigRows() {
    if (!configDraft) return;
    configDraft = sanitizeConfig(configDraft);
    const draftRanges = buildStructure(configDraft);
    const totalPoints = draftRanges.reduce((sum, range) => sum + range.count, 0);
    els.floorCount.max = String(10 - configDraft.startFloor);
    els.floorCount.value = String(configDraft.floors.length);
    els.configTotal.textContent = `${totalPoints} ${pluralize(totalPoints, "punkt", "punkty", "punktów")}`;
    els.floorConfigRows.innerHTML = draftRanges.map((range, index) => `
      <div class="floor-config-row">
        <div><strong>${escapeHtml(range.floor)}</strong><small data-range-preview="${index}">${escapeHtml(range.label)}</small></div>
        <label><span>Liczba gniazd</span><input type="number" inputmode="numeric" min="1" max="999" value="${range.count}" data-floor-index="${index}" aria-label="Liczba gniazd — ${escapeHtml(range.floor)}" /></label>
      </div>`).join("");
    els.configWarning.textContent = configDraft.startFloor === 0
      ? "Liczba kondygnacji obejmuje parter. Każde piętro może mieć inną liczbę gniazdek."
      : "Numeracja rozpocznie się od piętra 1. Każde piętro może mieć inną liczbę gniazdek.";
  }

  function openSettingsDialog() {
    els.projectName.value = state.settings.project;
    els.testerName.value = state.settings.tester;
    configDraft = sanitizeConfig(state.config);
    els.numberingMode.value = configDraft.numbering;
    els.startFloor.value = String(configDraft.startFloor);
    renderFloorConfigRows();
    els.settingsDialog.showModal();
  }

  function applyConfiguration(nextConfig) {
    const previousNumber = currentNumber();
    const previousEnds = { ...state.floorEnds };
    state.config = sanitizeConfig(nextConfig);
    rebuildStructure(state.config);
    state.currentIndex = numberIndex.get(previousNumber) ?? 0;
    state.floorEnds = {};
    ranges.forEach((range) => {
      const previousEnd = previousEnds[range.id];
      if (range.numbers.includes(previousEnd)) state.floorEnds[range.id] = previousEnd;
    });
    state.version = BACKUP_VERSION;
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  function buildReportHtml(scope = "all") {
    const errorsOnly = scope === "errors";
    const reportNumbers = getExportNumbers(scope);
    const includedNumbers = new Set(reportNumbers);
    const reportTitle = errorsOnly ? "Raport wszystkich błędów" : "Raport kontroli okablowania";
    const counts = getCounts(reportNumbers);
    const now = new Date();
    const title = state.settings.project || "Kontrola okablowania strukturalnego";
    const rangesDescription = ranges.map((range) =>
      `${range.floor}: ${range.start}–${getRangeEnd(range)}`
    ).join(" • ");

    const floorSections = ranges.map((range) => {
      const rangeEnd = getRangeEnd(range);
      const floorNumbers = getRangeNumbers(range).filter((number) => includedNumbers.has(number));
      if (errorsOnly && !floorNumbers.length) return "";
      const floorCounts = getCounts(floorNumbers);
      const manuallyEnded = state.floorEnds[range.id] !== undefined;
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
          <div class="floor-range">${escapeHtml(range.start)}–${escapeHtml(rangeEnd)}<small>${manuallyEnded ? `Ostatni numer: ${escapeHtml(rangeEnd)}` : "Pełny zakres"}</small></div>
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

    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${reportTitle} — ${escapeHtml(title)}</title>
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
        <h1>${reportTitle}</h1>
        <div><strong>${escapeHtml(title)}</strong></div>
        ${errorsOnly ? "<p>Wszystkie punkty ze statusem Błąd: uszkodzone kable, błędnie zakończone gniazdka, błędnie zakończone keystone’y oraz inne opisane błędy.</p>" : ""}
        <div class="meta"><span>Osoba testująca: <strong>${escapeHtml(state.settings.tester || "—")}</strong></span><span>Wygenerowano: <strong>${escapeHtml(formatDateTime(now.toISOString()))}</strong></span><span>Zakresy raportu: ${escapeHtml(rangesDescription)}</span><span>Łącznie: ${reportNumbers.length} punktów</span></div>
      </header>
      <section class="summary">
        <div><span>Sprawdzone</span><strong>${counts.checked}</strong></div>
        <div><span>OK</span><strong>${counts.ok}</strong></div>
        <div><span>Błędy</span><strong>${counts.error}</strong></div>
        <div><span>Niezarobione</span><strong>${counts.unmade}</strong></div>
        <div><span>Niesprawdzone</span><strong>${counts.pending}</strong></div>
      </section>
      ${errorsOnly && !reportNumbers.length ? "<p>Brak zapisanych błędów w zakresie raportu.</p>" : floorSections}
      </body></html>`;
  }

  function openPrintReport(scope = "all") {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      showToast("Przeglądarka zablokowała raport. Zezwól na otwieranie nowych kart.");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(buildReportHtml(scope));
    reportWindow.document.close();
    window.setTimeout(() => {
      reportWindow.focus();
      reportWindow.print();
    }, 450);
  }

  function exportCsv(scope = "all") {
    const header = ["Lp.", "Piętro", "Numer", "Zakres raportu", "Wynik", "Opis błędu", "Data", "Godzina", "Obiekt", "Osoba testująca"];
    const rows = getExportNumbers(scope).map((number, index) => {
      const record = state.records[number];
      const status = record?.status || "pending";
      const date = record?.testedAt ? new Date(record.testedAt) : null;
      const range = getRange(number);
      return [
        index + 1,
        range.floor,
        state.config.numbering === "numeric" ? `="${number}"` : number,
        `${range.start}–${getRangeEnd(range)}`,
        STATUS_LABELS[status],
        record?.note || "",
        date ? date.toLocaleDateString("pl-PL") : "",
        date ? date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "",
        state.settings.project,
        state.settings.tester
      ];
    });
    const csv = "\ufeffsep=;\r\n" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const suffix = scope === "errors" ? "_wszystkie_bledy" : "";
    downloadBlob(csv, "text/csv;charset=utf-8", `${fileBaseName()}${suffix}_${dateStamp()}.csv`);
    showToast("Raport Excel / CSV został przygotowany.");
  }

  function exportBackup() {
    const backup = {
      application: "Tester okablowania",
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      ranges: ranges.map((range) => ({ floor: range.floor, start: range.start, end: range.end, count: range.count })),
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
      candidate.config = sanitizeConfig(restored.config);
      candidate.testFilter = normalizeTestFilter(restored.testFilter);
      const candidateRanges = buildStructure(candidate.config);
      const candidateNumbers = candidateRanges.flatMap((range) => range.numbers);
      candidate.currentIndex = Number.isInteger(restored.currentIndex)
        ? Math.min(Math.max(restored.currentIndex, 0), candidateNumbers.length - 1)
        : 0;
      candidate.settings.project = String(restored.settings?.project || "").slice(0, 100);
      candidate.settings.tester = String(restored.settings?.tester || "").slice(0, 80);
      candidateRanges.forEach((range) => {
        const legacyKey = candidate.config.numbering === "numeric" ? String(Number(range.start)) : null;
        const rawEnd = restored.floorEnds?.[range.id] ?? (legacyKey ? restored.floorEnds?.[legacyKey] : undefined);
        const directEnd = String(rawEnd ?? "");
        const migratedEnd = range.numbers.includes(directEnd)
          ? directEnd
          : candidate.config.numbering === "numeric"
            ? range.numbers.find((number) => Number(number) === Number(rawEnd))
            : undefined;
        if (migratedEnd) candidate.floorEnds[range.id] = migratedEnd;
      });
      Object.entries(restored.records).forEach(([number, record]) => {
        const safeNumber = String(number).trim().slice(0, 40);
        if (!safeNumber || !["ok", "error", "unmade"].includes(record?.status)) return;
        candidate.records[safeNumber] = {
          status: record.status,
          note: String(record.note || "").slice(0, 300),
          testedAt: isValidDate(record.testedAt) ? record.testedAt : new Date().toISOString()
        };
      });
      if (!window.confirm(`Wczytać kopię zawierającą ${Object.keys(candidate.records).length} wyników? Obecne dane zostaną zastąpione.`)) return;
      state = candidate;
      rebuildStructure(state.config);
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
    const savedResults = Object.keys(state.records).length;
    if ((savedResults > 0 || Object.keys(state.floorEnds).length > 0)
      && !window.confirm(`Usunąć wszystkie ${savedResults} zapisane wyniki oraz oznaczenia końców pięter i rozpocząć nowy pomiar? Tej operacji nie można cofnąć.`)) return;
    state.records = {};
    state.floorEnds = {};
    state.currentIndex = 0;
    state.testFilter = "all";
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
  els.deleteRecordButton.addEventListener("click", deleteCurrentRecord);
  els.floorEndButton.addEventListener("click", toggleFloorEnd);
  $("#numberButton").addEventListener("click", openJumpDialog);
  $("#settingsButton").addEventListener("click", openSettingsDialog);
  els.testScope.addEventListener("change", () => setTestFilter(els.testScope.value));
  $("#showAllTestsButton").addEventListener("click", () => setTestFilter("all"));
  $("#retestErrorsButton").addEventListener("click", () => setTestFilter("error"));
  $("#retestUnmadeButton").addEventListener("click", () => setTestFilter("unmade"));

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
      : result === "filtered"
        ? "To gniazdko nie należy do wybranej grupy. Zmień tryb testowania na Wszystkie."
        : "Ten numer nie występuje na liście.";
    els.jumpError.hidden = false;
    els.jumpInput.focus();
    els.jumpInput.select();
  });

  els.rangeShortcuts.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-jump]");
    if (!button) return;
    els.jumpInput.value = button.dataset.jump;
    els.jumpError.hidden = true;
  });

  els.jumpInput.addEventListener("input", () => {
    if (state.config.numbering === "numeric") {
      els.jumpInput.value = els.jumpInput.value.replace(/\D/g, "").slice(0, 4);
    }
    els.jumpError.hidden = true;
  });

  els.numberingMode.addEventListener("change", () => {
    if (!configDraft) return;
    configDraft.numbering = els.numberingMode.value;
    renderFloorConfigRows();
  });

  els.startFloor.addEventListener("change", () => {
    if (!configDraft) return;
    configDraft.startFloor = Number(els.startFloor.value) === 1 ? 1 : 0;
    configDraft.floors = configDraft.floors.slice(0, 10 - configDraft.startFloor);
    renderFloorConfigRows();
  });

  els.floorCount.addEventListener("input", () => {
    if (!configDraft || !els.floorCount.value) return;
    const requested = Math.min(10 - configDraft.startFloor, Math.max(1, Number.parseInt(els.floorCount.value, 10) || 1));
    while (configDraft.floors.length < requested) configDraft.floors.push({ count: 100 });
    configDraft.floors = configDraft.floors.slice(0, requested);
    renderFloorConfigRows();
  });

  els.floorConfigRows.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-floor-index]");
    if (!input || !configDraft) return;
    const index = Number(input.dataset.floorIndex);
    configDraft.floors[index].count = Math.min(999, Math.max(1, Number.parseInt(input.value, 10) || 1));
    renderFloorConfigRows();
  });

  $("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!configDraft) return;
    els.floorConfigRows.querySelectorAll("input[data-floor-index]").forEach((input) => {
      const index = Number(input.dataset.floorIndex);
      if (configDraft.floors[index]) configDraft.floors[index].count = Number.parseInt(input.value, 10) || 1;
    });
    const nextConfig = sanitizeConfig(configDraft);
    const nextNumbers = new Set(buildStructure(nextConfig).flatMap((range) => range.numbers));
    const affectedRecords = numbers.filter((number) => state.records[number] && !nextNumbers.has(number)).length;
    if (affectedRecords > 0 && !window.confirm(
      `Nowa konfiguracja ukryje ${affectedRecords} ${pluralize(affectedRecords, "zapisany wynik", "zapisane wyniki", "zapisanych wyników")}. `
      + "Wyniki nie zostaną usunięte i pojawią się ponownie po przywróceniu wcześniejszej numeracji. Zapisać konfigurację?"
    )) return;
    state.settings.project = els.projectName.value.trim();
    state.settings.tester = els.testerName.value.trim();
    applyConfiguration(nextConfig);
    saveState();
    closeDialog("settingsDialog");
    render();
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
    if (row) goToNumber(row.dataset.number, true);
  });

  $("#printButton").addEventListener("click", () => openPrintReport());
  $("#csvButton").addEventListener("click", () => exportCsv());
  $("#errorPrintButton").addEventListener("click", () => openPrintReport("errors"));
  $("#errorCsvButton").addEventListener("click", () => exportCsv("errors"));
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
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js?v=9", { updateViaCache: "none" });
        await registration.update();
      } catch (_) {}
    });
  }

  render();
})();
