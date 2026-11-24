(() => {
  "use strict";

  if (new URLSearchParams(window.location.search).has("preview")) {
    document.documentElement.dataset.preview = "true";
    return;
  }

  const TASKS_KEY = "daymark.tasks.v1";
  const THEME_KEY = "daymark.theme.v1";
  const statuses = {
    "not-started": "Not started",
    "in-progress": "In progress",
    completed: "Completed",
    blocked: "Blocked",
    waiting: "Waiting"
  };
  const validDifficulties = ["easy", "medium", "hard"];
  const elements = {
    taskGrid: document.querySelector("#task-grid"),
    emptyState: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyCopy: document.querySelector("#empty-copy"),
    taskCount: document.querySelector("#task-count"),
    search: document.querySelector("#task-search"),
    filter: document.querySelector("#status-filter"),
    dialog: document.querySelector("#task-dialog"),
    form: document.querySelector("#task-form"),
    dialogTitle: document.querySelector("#dialog-title"),
    taskId: document.querySelector("#task-id"),
    title: document.querySelector("#task-title"),
    description: document.querySelector("#task-description"),
    status: document.querySelector("#task-status"),
    dueDate: document.querySelector("#task-due"),
    difficulty: document.querySelector("#task-difficulty"),
    dependency: document.querySelector("#task-dependency"),
    important: document.querySelector("#task-important"),
    urgent: document.querySelector("#task-urgent"),
    formError: document.querySelector("#form-error"),
    submitLabel: document.querySelector("#submit-label"),
    storageNotice: document.querySelector("#storage-notice"),
    themeToggle: document.querySelector("#theme-toggle"),
    toast: document.querySelector("#toast")
  };

  let tasks = loadTasks();
  let toastTimer;

  function isValidTask(task) {
    return task && typeof task.id === "string" && typeof task.title === "string" &&
      task.title.trim() && Object.prototype.hasOwnProperty.call(statuses, task.status) &&
      typeof task.description === "string" && typeof task.important === "boolean" &&
      typeof task.urgent === "boolean" && validDifficulties.includes(task.difficulty) &&
      (task.dueDate === "" || /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) &&
      (task.dependency === "" || typeof task.dependency === "string") &&
      typeof task.createdAt === "string" && typeof task.updatedAt === "string";
  }

  function loadTasks() {
    try {
      const saved = localStorage.getItem(TASKS_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(isValidTask)) {
        throw new Error("Saved task data is invalid.");
      }
      return parsed;
    } catch (error) {
      showStorageError("Your saved tasks could not be loaded. Check browser storage, then refresh to try again.");
      console.error("Could not read Daymark tasks from local storage.", error);
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
      elements.storageNotice.hidden = true;
      return true;
    } catch (error) {
      showStorageError("Changes could not be saved to this device. Check that browser storage is available.");
      console.error("Could not save Daymark tasks to local storage.", error);
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

  function dateFromISO(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(value, options) {
    if (!value) return "";
    return new Intl.DateTimeFormat(undefined, options).format(dateFromISO(value));
  }

  function isOverdue(task) {
    if (!task.dueDate || task.status === "completed") return false;
    const due = dateFromISO(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  }

  function renderStats() {
    const counts = { total: tasks.length, completed: 0, "not-started": 0, "in-progress": 0, blocked: 0, waiting: 0 };
    tasks.forEach((task) => { counts[task.status] += 1; });
    document.querySelectorAll("[data-stat]").forEach((counter) => {
      counter.textContent = String(counts[counter.dataset.stat] || 0);
    });
  }

  function taskCard(task) {
    const dependency = task.dependency ? tasks.find((candidate) => candidate.id === task.dependency) : null;
    const dueText = task.dueDate
      ? `<span class="meta-chip ${isOverdue(task) ? "is-overdue" : ""}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 3v4M8 3v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${escapeHtml(formatDate(task.dueDate, { month: "short", day: "numeric" }))}${isOverdue(task) ? " · overdue" : ""}</span>`
      : "";
    const dependencyText = dependency
      ? `<div class="task-dependency"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 7v5l3 2m5-2a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Waiting for: <strong>${escapeHtml(dependency.title)}</strong></span></div>`
      : "";
    const quickAction = task.status === "completed"
      ? `<button class="quick-status" type="button" data-action="status" data-id="${escapeHtml(task.id)}" data-status="not-started">↶ Reopen task</button>`
      : `<button class="quick-status" type="button" data-action="status" data-id="${escapeHtml(task.id)}" data-status="${task.status === "waiting" ? "waiting" : "completed"}">${task.status === "waiting" ? "Waiting on dependency" : "Mark complete →"}</button>`;

    return `<article class="task-card status-${task.status}">
      <div class="task-card-top">
        <span class="status-pill">${escapeHtml(statuses[task.status])}</span>
        <div class="card-menu-wrap">
          <button class="card-menu-button" type="button" aria-label="Actions for ${escapeHtml(task.title)}" aria-expanded="false" data-action="menu" data-id="${escapeHtml(task.id)}">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
          </button>
        </div>
      </div>
      <h3>${escapeHtml(task.title)}</h3>
      <p class="task-description">${escapeHtml(task.description || "No extra details")}</p>
      ${dependencyText}
      <div class="task-card-meta">
        ${task.urgent ? `<span class="meta-chip priority-chip"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 2.8 19h18.4L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v4m0 3h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Urgent</span>` : ""}
        ${task.important ? `<span class="meta-chip important-chip"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 5h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Important</span>` : ""}
        ${dueText}
        <span class="meta-chip difficulty-chip">${escapeHtml(task.difficulty[0].toUpperCase() + task.difficulty.slice(1))}</span>
      </div>
      <div class="task-card-bottom">${quickAction}${task.updatedAt ? `<span class="task-date">Updated ${escapeHtml(formatDate(task.updatedAt.slice(0, 10), { month: "short", day: "numeric" }))}</span>` : ""}</div>
    </article>`;
  }

  function renderTasks() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    const selectedStatus = elements.filter.value;
    const shownTasks = tasks.filter((task) => {
      const matchesStatus = selectedStatus === "all" || task.status === selectedStatus;
      const matchesText = !query || `${task.title} ${task.description}`.toLocaleLowerCase().includes(query);
      return matchesStatus && matchesText;
    }).sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.dueDate ? -1 : b.dueDate ? 1 : b.updatedAt.localeCompare(a.updatedAt);
    });

    elements.taskGrid.innerHTML = shownTasks.map(taskCard).join("");
    elements.taskCount.textContent = String(shownTasks.length);
    elements.taskGrid.hidden = shownTasks.length === 0;
    elements.emptyState.hidden = shownTasks.length > 0;
    if (tasks.length === 0) {
      elements.emptyTitle.textContent = "Your next great thing starts here.";
      elements.emptyCopy.textContent = "Add a task to turn that to-do into a done.";
    } else {
      elements.emptyTitle.textContent = "Nothing to see here.";
      elements.emptyCopy.textContent = "Try another search or status filter.";
    }
    renderStats();
  }

  function refreshDependencyOptions(selectedId, currentDependency) {
    const eligible = tasks.filter((task) => task.id !== selectedId && task.status !== "completed");
    elements.dependency.innerHTML = `<option value="">No dependency</option>${eligible.map((task) =>
      `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`).join("")}`;
    if (currentDependency && eligible.some((task) => task.id === currentDependency)) {
      elements.dependency.value = currentDependency;
    }
  }

  function openDialog(task) {
    elements.form.reset();
    elements.formError.hidden = true;
    elements.taskId.value = task ? task.id : "";
    elements.dialogTitle.textContent = task ? "Edit task" : "Add a task";
    elements.submitLabel.textContent = task ? "Save changes" : "Add task";
    refreshDependencyOptions(task ? task.id : "", task ? task.dependency : "");
    if (task) {
      elements.title.value = task.title;
      elements.description.value = task.description;
      elements.status.value = task.status;
      elements.dueDate.value = task.dueDate;
      elements.difficulty.value = task.difficulty;
      elements.important.checked = task.important;
      elements.urgent.checked = task.urgent;
    } else {
      elements.status.value = "not-started";
      elements.difficulty.value = "medium";
    }
    elements.dialog.showModal();
    requestAnimationFrame(() => elements.title.focus());
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
  }

  function updateTaskStatus(id, status) {
    if (!Object.prototype.hasOwnProperty.call(statuses, status)) return;
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (status === "completed") {
      tasks.forEach((dependent) => {
        if (dependent.dependency === id && dependent.status === "waiting") {
          dependent.status = "not-started";
          dependent.updatedAt = task.updatedAt;
        }
      });
    }
    saveTasks();
    renderTasks();
    showToast(status === "completed" ? "Task completed. Nice work!" : "Task status updated.");
  }

  function deleteTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task || !window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    tasks = tasks.filter((item) => item.id !== id);
    tasks.forEach((dependent) => {
      if (dependent.dependency === id) {
        dependent.dependency = "";
        if (dependent.status === "waiting") dependent.status = "not-started";
      }
    });
    saveTasks();
    renderTasks();
    showToast("Task deleted.");
  }

  function closeMenus() {
    document.querySelectorAll(".card-menu").forEach((menu) => menu.remove());
    document.querySelectorAll(".card-menu-button[aria-expanded='true']").forEach((button) => button.setAttribute("aria-expanded", "false"));
  }

  function toggleCardMenu(button, id) {
    const existing = button.parentElement.querySelector(".card-menu");
    closeMenus();
    if (existing) return;
    const menu = document.createElement("div");
    menu.className = "card-menu";
    menu.innerHTML = `<button type="button" data-action="edit" data-id="${escapeHtml(id)}">Edit task</button><button class="delete-action" type="button" data-action="delete" data-id="${escapeHtml(id)}">Delete task</button>`;
    button.parentElement.append(menu);
    button.setAttribute("aria-expanded", "true");
  }

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = elements.title.value.trim();
    const dependency = elements.dependency.value;
    const editingId = elements.taskId.value;
    const linkedTask = tasks.find((task) => task.id === dependency);
    if (!title) {
      elements.formError.textContent = "Add a task name before saving.";
      elements.formError.hidden = false;
      elements.title.focus();
      return;
    }
    if (dependency && (!linkedTask || dependency === editingId)) {
      elements.formError.textContent = "Choose an available task to wait for, or clear the dependency.";
      elements.formError.hidden = false;
      return;
    }
    if (elements.status.value === "waiting" && !dependency) {
      elements.formError.textContent = "Select a task to wait for, or choose another status.";
      elements.formError.hidden = false;
      elements.dependency.focus();
      return;
    }
    const existing = editingId ? tasks.find((task) => task.id === editingId) : null;
    const now = new Date().toISOString();
    const status = linkedTask && linkedTask.status !== "completed"
      ? "waiting"
      : elements.status.value;
    const task = {
      id: existing ? existing.id : (window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      title,
      description: elements.description.value.trim(),
      status,
      dueDate: elements.dueDate.value,
      difficulty: elements.difficulty.value,
      important: elements.important.checked,
      urgent: elements.urgent.checked,
      dependency: linkedTask && linkedTask.status !== "completed" ? dependency : "",
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    if (existing) {
      tasks = tasks.map((candidate) => candidate.id === editingId ? task : candidate);
    } else {
      tasks.push(task);
    }
    saveTasks();
    renderTasks();
    elements.dialog.close();
    showToast(existing ? "Changes saved." : "Task added.");
  });

  elements.taskGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      closeMenus();
      return;
    }
    const { action, id, status } = button.dataset;
    if (action === "menu") toggleCardMenu(button, id);
    if (action === "edit") {
      closeMenus();
      const task = tasks.find((item) => item.id === id);
      if (task) openDialog(task);
    }
    if (action === "delete") {
      closeMenus();
      deleteTask(id);
    }
    if (action === "status") updateTaskStatus(id, status);
  });

  document.querySelector("#add-task-button").addEventListener("click", () => openDialog(null));
  document.querySelector("#empty-add-button").addEventListener("click", () => openDialog(null));
  document.querySelector("#dialog-close").addEventListener("click", () => elements.dialog.close());
  document.querySelector("#cancel-button").addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) elements.dialog.close();
  });
  elements.search.addEventListener("input", renderTasks);
  elements.filter.addEventListener("change", renderTasks);
  elements.dependency.addEventListener("change", () => {
    if (elements.dependency.value) elements.status.value = "waiting";
  });
  elements.status.addEventListener("change", () => {
    if (elements.status.value === "waiting" && !elements.dependency.value) {
      elements.formError.textContent = "Select a task to wait for, or choose another status.";
      elements.formError.hidden = false;
    } else {
      if (elements.status.value !== "waiting") elements.dependency.value = "";
      elements.formError.hidden = true;
    }
  });

  const savedTheme = (() => {
    try { return localStorage.getItem(THEME_KEY); }
    catch (error) {
      console.error("Could not read Daymark theme from local storage.", error);
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
      console.error("Could not save Daymark theme to local storage.", error);
      showStorageError("Your theme changed, but couldn't be saved to this device.");
    }
  });

  const today = new Date();
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(today);
  document.querySelector("#date-day").textContent = String(today.getDate()).padStart(2, "0");
  document.querySelector("#date-month").textContent = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(today);
  renderTasks();
})();
