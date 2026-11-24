(() => {
  "use strict";

  const CHECKLISTS_KEY = "goodlist.checklists.v1";
  const THEME_KEY = "goodlist.theme.v1";
  const ABANDONED_AFTER_DAYS = 30;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const elements = {
    dashboard: document.querySelector("#dashboard"),
    checklistView: document.querySelector("#checklist-view"),
    storageNotice: document.querySelector("#storage-notice"),
    listCount: document.querySelector("#list-count"),
    emptyDashboard: document.querySelector("#empty-dashboard"),
    dialog: document.querySelector("#checklist-dialog"),
    form: document.querySelector("#checklist-form"),
    name: document.querySelector("#checklist-name"),
    description: document.querySelector("#checklist-details"),
    seedItems: document.querySelector("#checklist-items"),
    formError: document.querySelector("#form-error"),
    checklistTitle: document.querySelector("#checklist-title"),
    checklistDescription: document.querySelector("#checklist-description"),
    progressLabel: document.querySelector("#progress-label"),
    progressPercent: document.querySelector("#progress-percent"),
    progressBar: document.querySelector("#progress-bar"),
    progressFill: document.querySelector("#progress-fill"),
    filterButtons: [...document.querySelectorAll(".filter-button")],
    itemList: document.querySelector("#item-list"),
    completionMessage: document.querySelector("#completion-message"),
    noFilterResults: document.querySelector("#no-filter-results"),
    addItemForm: document.querySelector("#add-item-form"),
    newItemTitle: document.querySelector("#new-item-title"),
    themeToggle: document.querySelector("#theme-toggle"),
    toast: document.querySelector("#toast")
  };
  const bucketNames = ["not-started", "in-progress", "completed", "abandoned"];
  let checklists = loadChecklists();
  let activeChecklistId = null;
  let activeFilter = "all";
  let toastTimer;

  function isValidItem(item) {
    return item && typeof item.id === "string" && typeof item.title === "string" &&
      item.title.trim().length > 0 && typeof item.checked === "boolean" &&
      typeof item.wasUnchecked === "boolean" && typeof item.note === "string";
  }

  function isValidChecklist(checklist) {
    return checklist && typeof checklist.id === "string" && typeof checklist.name === "string" &&
      checklist.name.trim().length > 0 && typeof checklist.description === "string" &&
      Array.isArray(checklist.items) && checklist.items.every(isValidItem) &&
      typeof checklist.createdAt === "string" && typeof checklist.updatedAt === "string" &&
      typeof checklist.lastOpenedAt === "string" &&
      (checklist.startedAt === "" || typeof checklist.startedAt === "string") &&
      (checklist.completedAt === "" || typeof checklist.completedAt === "string");
  }

  function loadChecklists() {
    try {
      const saved = localStorage.getItem(CHECKLISTS_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(isValidChecklist)) {
        throw new Error("Saved checklist data is invalid.");
      }
      return parsed;
    } catch (error) {
      showStorageError("Your saved checklists could not be loaded. Check browser storage, then refresh to try again.");
      console.error("Could not read Goodlist data from local storage.", error);
      return [];
    }
  }

  function saveChecklists() {
    try {
      localStorage.setItem(CHECKLISTS_KEY, JSON.stringify(checklists));
      elements.storageNotice.hidden = true;
      return true;
    } catch (error) {
      showStorageError("Changes could not be saved to this device. Check that browser storage is available.");
      console.error("Could not save Goodlist data to local storage.", error);
      return false;
    }
  }

  function showStorageError(message) {
    elements.storageNotice.textContent = message;
    elements.storageNotice.hidden = false;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function makeId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getProgress(checklist) {
    const total = checklist.items.length;
    const checked = checklist.items.filter((item) => item.checked).length;
    return { total, checked, percent: total ? Math.round((checked / total) * 100) : 0 };
  }

  function bucketFor(checklist, now) {
    const progress = getProgress(checklist);
    if (progress.total > 0 && progress.checked === progress.total) return "completed";
    if (now - Date.parse(checklist.lastOpenedAt) >= ABANDONED_AFTER_DAYS * DAY_MS) return "abandoned";
    if (progress.checked > 0) return "in-progress";
    return "not-started";
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }

  function formatDuration(milliseconds) {
    const minutes = Math.max(0, Math.round(milliseconds / 60000));
    if (minutes < 1) return "Less than a minute";
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours} ${hours === 1 ? "hour" : "hours"}`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours ? `${days}d ${remainingHours}h` : `${days} ${days === 1 ? "day" : "days"}`;
  }

  function checklistCard(checklist) {
    const progress = getProgress(checklist);
    const notes = checklist.items.filter((item) => item.note.trim()).length;
    const label = progress.total ? `${progress.checked} of ${progress.total} steps` : "No steps yet";
    return `<article class="list-card" data-action="open" data-id="${escapeHtml(checklist.id)}" tabindex="0" role="button" aria-label="Open checklist: ${escapeHtml(checklist.name)}">
      <div class="list-card-header">
        <div class="list-title">
          <h4>${escapeHtml(checklist.name)}</h4>
          ${checklist.description ? `<p class="list-description">${escapeHtml(checklist.description)}</p>` : ""}
        </div>
        <span class="list-open-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>
      <div class="list-progress">
        <div class="list-progress-copy"><span>${label}</span><span>${progress.percent}%</span></div>
        <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
      </div>
      <div class="list-footer"><span>${progress.total === 0 ? "Add your first step" : `Last opened ${escapeHtml(formatDate(checklist.lastOpenedAt))}`}</span><span class="notes-count"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 2V7a2 2 0 0 1 2-2h3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 10h8m-8 4h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>${notes}</span></div>
    </article>`;
  }

  function renderDashboard() {
    const now = Date.now();
    const buckets = Object.fromEntries(bucketNames.map((name) => [name, []]));
    checklists.forEach((checklist) => buckets[bucketFor(checklist, now)].push(checklist));
    bucketNames.forEach((name) => {
      const bucketItems = buckets[name].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      document.querySelector(`#bucket-${name}`).innerHTML = bucketItems.map(checklistCard).join("");
      document.querySelector(`#count-${name}`).textContent = String(bucketItems.length);
      document.querySelector(`#empty-${name}`).hidden = bucketItems.length > 0;
    });
    elements.listCount.textContent = String(checklists.length);
    elements.emptyDashboard.hidden = checklists.length > 0;
    document.querySelector(".bucket-list").hidden = checklists.length === 0;
  }

  function renderCompletionSummary(checklist, progress) {
    const complete = progress.total > 0 && progress.checked === progress.total;
    elements.completionMessage.hidden = !complete;
    if (!complete) return;

    const started = Date.parse(checklist.startedAt);
    const ended = Date.parse(checklist.completedAt);
    const duration = Number.isFinite(started) && Number.isFinite(ended) ? formatDuration(ended - started) : "Just now";
    const notes = checklist.items.filter((item) => item.note.trim());
    const stats = [`Finished in ${escapeHtml(duration)}`, `${progress.total} ${progress.total === 1 ? "step" : "steps"} checked`];
    elements.completionMessage.innerHTML = `<span class="completion-icon" aria-hidden="true">✦</span>
      <div class="completion-body"><h3>Look at you — you did it!</h3><p>This checklist is complete. Take a breath and enjoy that feeling.</p>
      <div class="completion-stats">${stats.map((stat) => `<span class="completion-stat">${stat}</span>`).join("")}</div>
      ${notes.length ? `<div class="notes-summary"><p class="notes-summary-title">A few notes to remember</p><ul class="notes-summary-list">${notes.map((item) => `<li><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.note)}</li>`).join("")}</ul></div>` : ""}
      </div>`;
  }

  function renderItems(checklist) {
    const progress = getProgress(checklist);
    const visibleItems = checklist.items.filter((item) => {
      if (activeFilter === "checked") return item.checked;
      if (activeFilter === "unchecked") return !item.checked;
      return true;
    });
    elements.progressLabel.textContent = `${progress.checked} of ${progress.total} ${progress.total === 1 ? "step" : "steps"} checked`;
    elements.progressPercent.textContent = `${progress.percent}%`;
    elements.progressFill.style.width = `${progress.percent}%`;
    elements.progressBar.setAttribute("aria-valuenow", String(progress.percent));
    document.querySelector("#filter-all-count").textContent = String(progress.total);
    document.querySelector("#filter-unchecked-count").textContent = String(progress.total - progress.checked);
    document.querySelector("#filter-checked-count").textContent = String(progress.checked);
    renderCompletionSummary(checklist, progress);

    elements.itemList.innerHTML = visibleItems.map((item) => {
      const classNames = ["checklist-item", item.checked ? "is-checked" : "", item.wasUnchecked && !item.checked ? "was-unchecked" : ""].filter(Boolean).join(" ");
      return `<article class="${classNames}">
        <div class="item-main">
          <input class="item-check" id="item-${escapeHtml(item.id)}" type="checkbox" data-action="check" data-id="${escapeHtml(item.id)}" ${item.checked ? "checked" : ""} aria-label="${item.checked ? "Uncheck" : "Check"} ${escapeHtml(item.title)}">
          <label class="item-check-ui" for="item-${escapeHtml(item.id)}" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></label>
          <div class="item-copy"><span class="item-title">${escapeHtml(item.title)}</span><textarea class="item-note" data-action="note" data-id="${escapeHtml(item.id)}" rows="${item.note ? 2 : 1}" maxlength="300" placeholder="Add a little reminder or note..." aria-label="Note for ${escapeHtml(item.title)}">${escapeHtml(item.note)}</textarea></div>
          <button class="item-delete" type="button" data-action="delete-item" data-id="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </article>`;
    }).join("");

    const none = visibleItems.length === 0;
    elements.noFilterResults.hidden = !none;
    if (none) {
      elements.noFilterResults.textContent = checklist.items.length === 0
        ? "Add your first step below. Small starts count."
        : activeFilter === "checked" ? "No checked-off steps just yet." : "All caught up — nothing left on this list!";
    }
  }

  function openChecklist(id) {
    const checklist = checklists.find((item) => item.id === id);
    if (!checklist) return;
    activeChecklistId = id;
    activeFilter = "all";
    checklist.lastOpenedAt = new Date().toISOString();
    checklist.updatedAt = checklist.lastOpenedAt;
    saveChecklists();
    elements.dashboard.hidden = true;
    elements.checklistView.hidden = false;
    renderChecklist();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderChecklist() {
    const checklist = checklists.find((item) => item.id === activeChecklistId);
    if (!checklist) {
      showDashboard();
      return;
    }
    elements.checklistTitle.textContent = checklist.name;
    elements.checklistDescription.textContent = checklist.description;
    elements.checklistDescription.hidden = !checklist.description;
    elements.filterButtons.forEach((button) => {
      const active = button.dataset.filter === activeFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderItems(checklist);
  }

  function showDashboard() {
    activeChecklistId = null;
    elements.checklistView.hidden = true;
    elements.dashboard.hidden = false;
    renderDashboard();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2300);
  }

  function updateItem(id, update) {
    const checklist = checklists.find((item) => item.id === activeChecklistId);
    const item = checklist && checklist.items.find((candidate) => candidate.id === id);
    if (!checklist || !item) return;
    const before = getProgress(checklist);
    const now = new Date().toISOString();
    if (update === "toggle") {
      if (!item.checked) {
        if (!checklist.startedAt) checklist.startedAt = now;
        item.checked = true;
      } else {
        item.checked = false;
        item.wasUnchecked = true;
      }
      const after = getProgress(checklist);
      if (after.total > 0 && after.checked === after.total) checklist.completedAt = now;
      else checklist.completedAt = "";
      if (before.checked === before.total && after.checked < after.total) showToast("No worries — you can check it off again when you're ready.");
    } else {
      item.note = update;
    }
    checklist.updatedAt = now;
    saveChecklists();
    renderChecklist();
    renderDashboard();
  }

  function deleteChecklist() {
    const checklist = checklists.find((item) => item.id === activeChecklistId);
    if (!checklist || !window.confirm(`Delete "${checklist.name}" and all its steps? This can't be undone.`)) return;
    checklists = checklists.filter((item) => item.id !== activeChecklistId);
    saveChecklists();
    showDashboard();
    showToast("Checklist removed.");
  }

  function deleteItem(id) {
    const checklist = checklists.find((item) => item.id === activeChecklistId);
    if (!checklist) return;
    const item = checklist.items.find((candidate) => candidate.id === id);
    if (!item || !window.confirm(`Remove "${item.title}" from this checklist?`)) return;
    checklist.items = checklist.items.filter((candidate) => candidate.id !== id);
    const progress = getProgress(checklist);
    checklist.completedAt = progress.total > 0 && progress.checked === progress.total ? new Date().toISOString() : "";
    checklist.updatedAt = new Date().toISOString();
    saveChecklists();
    renderChecklist();
    renderDashboard();
  }

  document.querySelector("#add-checklist-button").addEventListener("click", () => {
    elements.form.reset();
    elements.formError.hidden = true;
    elements.dialog.showModal();
    requestAnimationFrame(() => elements.name.focus());
  });
  document.querySelector("#hero-add-button").addEventListener("click", () => document.querySelector("#add-checklist-button").click());
  document.querySelector("#empty-add-button").addEventListener("click", () => document.querySelector("#add-checklist-button").click());
  document.querySelector("#dialog-close").addEventListener("click", () => elements.dialog.close());
  document.querySelector("#cancel-button").addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) elements.dialog.close();
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.name.value.trim();
    const items = elements.seedItems.value.split(/\r?\n/).map((title) => title.trim()).filter(Boolean);
    if (!name || items.length === 0) {
      elements.formError.textContent = !name ? "Give your checklist a name before creating it." : "Add at least one step to get started.";
      elements.formError.hidden = false;
      return;
    }
    const now = new Date().toISOString();
    const checklist = {
      id: makeId(),
      name,
      description: elements.description.value.trim(),
      items: items.map((title) => ({ id: makeId(), title, checked: false, wasUnchecked: false, note: "" })),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      startedAt: "",
      completedAt: ""
    };
    checklists.push(checklist);
    saveChecklists();
    elements.dialog.close();
    renderDashboard();
    openChecklist(checklist.id);
    showToast("A fresh little plan, just for you.");
  });

  elements.dashboard.addEventListener("click", (event) => {
    const card = event.target.closest("[data-action='open']");
    if (card) openChecklist(card.dataset.id);
  });
  elements.dashboard.addEventListener("keydown", (event) => {
    const card = event.target.closest(".list-card[data-action='open']");
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openChecklist(card.dataset.id);
  });
  document.querySelector("#back-button").addEventListener("click", showDashboard);
  document.querySelector("#delete-checklist-button").addEventListener("click", deleteChecklist);
  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      renderChecklist();
    });
  });
  elements.itemList.addEventListener("change", (event) => {
    const input = event.target.closest("[data-action='check']");
    if (input) updateItem(input.dataset.id, "toggle");
  });
  elements.itemList.addEventListener("input", (event) => {
    const note = event.target.closest("[data-action='note']");
    if (!note) return;
    const checklist = checklists.find((item) => item.id === activeChecklistId);
    const item = checklist && checklist.items.find((candidate) => candidate.id === note.dataset.id);
    if (!checklist || !item) return;
    item.note = note.value;
    checklist.updatedAt = new Date().toISOString();
    saveChecklists();
    if (getProgress(checklist).total > 0 && getProgress(checklist).checked === getProgress(checklist).total) {
      renderCompletionSummary(checklist, getProgress(checklist));
    }
    renderDashboard();
  });
  elements.itemList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='delete-item']");
    if (button) deleteItem(button.dataset.id);
  });
  elements.addItemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = elements.newItemTitle.value.trim();
    const checklist = checklists.find((item) => item.id === activeChecklistId);
    if (!title || !checklist) return;
    if (getProgress(checklist).total > 0 && getProgress(checklist).checked === getProgress(checklist).total) {
      checklist.startedAt = new Date().toISOString();
    }
    checklist.completedAt = "";
    checklist.items.push({ id: makeId(), title, checked: false, wasUnchecked: false, note: "" });
    checklist.updatedAt = new Date().toISOString();
    elements.newItemTitle.value = "";
    if (activeFilter === "checked") activeFilter = "all";
    saveChecklists();
    renderChecklist();
    renderDashboard();
    elements.newItemTitle.focus();
  });

  const savedTheme = (() => {
    try { return localStorage.getItem(THEME_KEY); }
    catch (error) {
      console.error("Could not read Goodlist theme from local storage.", error);
      return null;
    }
  })();
  const theme = savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} mode`);
  elements.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    elements.themeToggle.setAttribute("aria-label", `Switch to ${nextTheme === "light" ? "dark" : "light"} mode`);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.error("Could not save Goodlist theme to local storage.", error);
      showStorageError("Your theme changed, but couldn't be saved to this device.");
    }
  });

  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  renderDashboard();
})();
