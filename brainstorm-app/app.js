(() => {
  "use strict";

  const storageKey = "brainstorm.boards.v1";
  const noteFontKey = "brainstorm.note-font.v1";
  const preview = new URLSearchParams(window.location.search).has("preview");
  const layouts = { open: "Open board", sections: "Custom sections", week: "Week board" };
  const colorModes = { priority: "Priorities", people: "Team members", custom: "Color legend", none: "" };
  const palette = {
    rose: { name: "Rose", paper: "#ffdde4", edge: "#c94e70" },
    gold: { name: "Gold", paper: "#fff2b9", edge: "#b58317" },
    blue: { name: "Blue", paper: "#daebff", edge: "#5180bf" },
    mint: { name: "Mint", paper: "#d2f3e6", edge: "#2a8a6f" },
    violet: { name: "Violet", paper: "#eae2ff", edge: "#8464bf" },
    peach: { name: "Peach", paper: "#ffe5d2", edge: "#b76a3e" }
  };
  const teamPaper = {
    rose: "#ff9cba",
    gold: "#ffda59",
    blue: "#84c9ff",
    mint: "#78e5bd",
    violet: "#c4a5ff",
    peach: "#ffb17e"
  };
  const priorities = {
    rose: "Urgent and important",
    gold: "Urgent, not important",
    blue: "Important, not urgent",
    mint: "Neither urgent nor important"
  };
  const sampleBoard = {
    id: "sample",
    title: "Project kick-off",
    description: "Sample board for planning a project from first ideas to launch.",
    layout: "sections",
    colorMode: "custom",
    colors: { gold: "Idea", violet: "Discussion", mint: "Next step" },
    sections: ["Explore", "Plan", "Deliver"],
    notes: [
      { id: "sample-1", section: 0, color: "gold", title: "Gather inspiration", body: "Bring one example of an approach we could build on." },
      { id: "sample-2", section: 0, color: "violet", title: "Define success", body: "What should people be able to do by the end of the project?" },
      { id: "sample-3", section: 1, color: "mint", title: "Map the milestones", body: "Agree on three checkpoints and assign an owner to each." },
      { id: "sample-4", section: 1, color: "gold", title: "Sketch the first version", body: "Make a quick draft we can walk through together." },
      { id: "sample-5", section: 2, color: "violet", title: "Review the draft", body: "Invite feedback before sharing the plan with the wider team." }
    ]
  };

  const get = (id) => document.getElementById(id);
  const boardForm = get("board-form");
  const noteForm = get("note-form");
  const boardFields = boardForm.elements;
  const noteFields = noteForm.elements;
  const boardDialog = get("board-dialog");
  const noteDialog = get("note-dialog");
  const columns = get("columns");
  const boardList = get("board-list");
  let state = preview ? { boards: [sampleBoard], activeId: sampleBoard.id } : load();
  let editingNoteId = null;
  let draggedNote = null;
  let dropMarker = null;
  const addPinTooltip = limitedTooltip(3);
  const addDeleteTooltip = limitedTooltip(1);

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved.boards) || (saved.boards.length
          ? !saved.boards.some((board) => board.id === saved.activeId)
          : saved.activeId !== null)) {
          throw new Error("Missing active board");
        }
        if (!saved.boards.some((board) => board.id === sampleBoard.id)) {
          return { boards: [sampleBoard, ...saved.boards], activeId: saved.activeId ?? sampleBoard.id };
        }
        return saved;
      }
    } catch (error) {
      console.warn("Could not load Brainstorm boards.", error);
      storageMessage("Saved boards couldn’t be loaded.");
    }
    return { boards: [sampleBoard], activeId: sampleBoard.id };
  }

  function storageMessage(message) {
    const notice = get("storage-error");
    notice.textContent = message;
    notice.hidden = !message;
  }

  function save(nextState) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextState));
      storageMessage("");
    } catch (error) {
      console.warn("Could not save Brainstorm boards.", error);
      storageMessage("Changes are visible here, but couldn’t be saved to this browser.");
    }
    state = nextState;
    render();
  }

  function activeBoard() {
    return state.boards.find((board) => board.id === state.activeId);
  }

  function updateNotes(notes) {
    save({
      ...state,
      boards: state.boards.map((board) => board.id === state.activeId ? { ...board, notes } : board)
    });
  }

  function markDrop(target, className) {
    if (dropMarker?.target === target && dropMarker.className === className) return;
    if (dropMarker) dropMarker.target.classList.remove(dropMarker.className);
    dropMarker = target ? { target, className } : null;
    if (dropMarker) target.classList.add(className);
  }

  function finishDrag() {
    if (draggedNote) draggedNote.card.classList.remove("is-dragging");
    draggedNote = null;
    markDrop(null);
  }

  function dropPosition(event, section) {
    const card = event.target.closest(".note-item")?.querySelector(".note");
    if (!card) return { target: section, marker: "drop-section" };
    if (card === draggedNote.card) return null;
    const bounds = card.getBoundingClientRect();
    const after = event.clientY >= bounds.top + bounds.height / 2;
    return { target: card, marker: after ? "drop-after" : "drop-before", after };
  }

  function addDropHandlers(section, sectionIndex) {
    section.addEventListener("dragover", (event) => {
      if (draggedNote?.boardId !== state.activeId) return;
      event.preventDefault();
      const position = dropPosition(event, section);
      event.dataTransfer.dropEffect = position ? "move" : "none";
      markDrop(position?.target, position?.marker);
    });
    section.addEventListener("dragleave", (event) => {
      if (!section.contains(event.relatedTarget) && section.contains(dropMarker?.target)) markDrop(null);
    });
    section.addEventListener("drop", (event) => {
      if (draggedNote?.boardId !== state.activeId) return;
      event.preventDefault();
      const position = dropPosition(event, section);
      const noteId = draggedNote.card.dataset.noteId;
      finishDrag();
      if (!position) return;

      const current = activeBoard().notes;
      const note = current.find((entry) => entry.id === noteId);
      if (!note) return;
      const notes = current.filter((entry) => entry.id !== noteId);
      const anchor = notes.findIndex((entry) => entry.id === position.target.dataset.noteId);
      const insertion = anchor < 0 ? notes.length : anchor + Number(position.after);
      notes.splice(insertion, 0, { ...note, section: sectionIndex });
      updateNotes(notes);
    });
  }

  function makeId() {
    return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, text) {
    const node = element("button", className, text);
    node.type = "button";
    return node;
  }

  function pinButton(note) {
    const pin = button("note-pin");
    pin.setAttribute("aria-label", `Pin note: ${note.title}`);
    pin.setAttribute("aria-pressed", String(Boolean(note.pinned)));
    const hint = note.pinned
      ? "Unpin this note to move it around the board."
      : "Pin this note to keep it in place. Unpin it to drag it around the board.";

    const svgNamespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(svgNamespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const head = document.createElementNS(svgNamespace, "path");
    head.setAttribute("d", "M8 3h8l-1 6 4 4v2H5v-2l4-4z");
    const point = document.createElementNS(svgNamespace, "path");
    point.setAttribute("d", "M12 15v6");
    point.setAttribute("fill", "none");
    icon.append(head, point);
    pin.append(icon);
    addPinTooltip(pin, hint);
    pin.addEventListener("click", () => {
      updateNotes(activeBoard().notes.map((entry) => (
        entry.id === note.id ? { ...entry, pinned: !entry.pinned } : entry
      )));
      columns.querySelector(`[data-note-id="${CSS.escape(note.id)}"]`)?.parentElement.querySelector(".note-pin")?.focus();
    });
    return pin;
  }

  function limitedTooltip(maxViews) {
    let views = 0;
    return (control, hint) => {
      const tooltip = element("span", "note-tooltip", hint);
      tooltip.setAttribute("aria-hidden", "true");
      control.setAttribute("aria-description", hint);
      control.append(tooltip);

      function showTooltip() {
        if (views >= maxViews || control.classList.contains("is-tooltip-visible")) return;
        views += 1;
        control.classList.add("is-tooltip-visible");
      }

      control.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") showTooltip();
      });
      control.addEventListener("pointerleave", () => {
        if (!control.matches(":focus-visible")) control.classList.remove("is-tooltip-visible");
      });
      control.addEventListener("focus", () => {
        if (control.matches(":focus-visible")) showTooltip();
      });
      control.addEventListener("blur", () => {
        if (!control.matches(":hover")) control.classList.remove("is-tooltip-visible");
      });
    };
  }

  function setPaper(node, color, mode) {
    const paper = color ? palette[color] : palette.gold;
    node.style.setProperty("--paper", mode === "people" ? (teamPaper[color] ?? paper.paper) : paper.paper);
    node.style.setProperty("--edge", paper.edge);
  }

  function colorLabel(color, label, mode) {
    const item = element("span", "swatch-label");
    const swatch = element("span", "swatch");
    swatch.setAttribute("aria-hidden", "true");
    setPaper(swatch, color, mode);
    item.append(swatch, document.createTextNode(label));
    return item;
  }

  function fillLegend(container, board) {
    container.replaceChildren();
    if (!Object.keys(board.colors).length) return;
    container.append(element("strong", "", colorModes[board.colorMode]));
    Object.entries(board.colors).forEach(([color, label]) => container.append(colorLabel(color, label, board.colorMode)));
  }

  function deleteBoard(entry, index) {
    if (!window.confirm(`Delete "${entry.title}" and all its notes? This can't be undone.`)) return;
    const boards = state.boards.filter((board) => board.id !== entry.id);
    const nextBoard = boards[index] ?? boards[index - 1];
    const deletingActive = entry.id === state.activeId;
    const activeId = deletingActive ? nextBoard?.id ?? null : state.activeId;
    save({ boards, activeId });
    if (deletingActive) get("canvas").scrollLeft = 0;
    (boardList.querySelector('[aria-current="true"]') ?? get("new-board")).focus();
  }

  function render() {
    finishDrag();
    const board = activeBoard();
    boardList.replaceChildren(...state.boards.map((entry, index) => {
      const row = element("div", "board-row");
      const link = button("board-link");
      const icon = element("span", "board-icon", "▦");
      icon.setAttribute("aria-hidden", "true");
      link.append(icon, element("span", "", entry.title));
      if (entry.id === state.activeId) link.setAttribute("aria-current", "true");
      link.addEventListener("click", () => {
        if (entry.id === state.activeId) return;
        save({ ...state, activeId: entry.id });
        get("canvas").scrollLeft = 0;
        boardList.querySelector('[aria-current="true"]').focus();
      });
      row.append(link);
      if (!preview && entry.id !== sampleBoard.id) {
        const remove = button("board-delete", "×");
        remove.setAttribute("aria-label", `Delete board: ${entry.title}`);
        remove.addEventListener("click", () => deleteBoard(entry, index));
        row.append(remove);
      }
      return row;
    }));
    get("board-header").hidden = !board;
    get("legend").hidden = !board;
    get("canvas").hidden = !board;
    get("board-empty").hidden = Boolean(board);
    if (!board) {
      columns.replaceChildren();
      get("print-sheet").replaceChildren();
      return;
    }
    get("board-title").textContent = board.title;
    get("board-type").textContent = layouts[board.layout];
    get("board-description").textContent = board.description;
    get("board-description").hidden = !board.description;
    fillLegend(get("legend"), board);
    columns.style.setProperty("--count", board.sections.length);
    columns.replaceChildren(...board.sections.map((name, index) => {
      const section = element("section", "column");
      if (!preview) addDropHandlers(section, index);
      const notes = board.notes.filter((note) => note.section === index);
      const heading = element("header", "column-header");
      heading.append(element("h2", "", name), element("span", "", `${notes.length} ${notes.length === 1 ? "note" : "notes"}`));
      const cards = element("div", "notes");
      notes.forEach((note) => {
        const item = element("div", "note-item");
        // Derive the paper placement from the ID so it survives moves and reloads.
        let hash = 2166136261;
        for (const character of note.id) {
          hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
        }
        item.style.setProperty("--note-tilt", `${((hash >>> 0) % 49 - 24) / 10}deg`);
        item.style.setProperty("--note-lift", `${((hash >>> 8) % 7) - 3}px`);
        item.style.setProperty("--shadow-x", `${Math.min(1, ((hash >>> 16) % 13) - 6)}px`);
        item.style.setProperty("--shadow-y", `${5 + (hash >>> 21) % 6}px`);
        item.style.setProperty("--shadow-blur", `${8 + (hash >>> 25) % 8}px`);
        const card = button("note");
        card.dataset.noteId = note.id;
        if (!preview && !note.pinned) {
          card.draggable = true;
          card.addEventListener("dragstart", (event) => {
            draggedNote = { boardId: board.id, card };
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", note.title);
            card.classList.add("is-dragging");
          });
          card.addEventListener("dragend", finishDrag);
        }
        setPaper(card, note.color, board.colorMode);
        card.append(element("strong", "", note.title));
        if (note.body) card.append(element("span", "note-text", note.body));
        if (note.color) card.append(element("span", "note-label", board.colors[note.color]));
        card.addEventListener("click", () => openNote(index, note));
        item.append(card);
        if (!preview) {
          const remove = button("note-delete", "×");
          remove.setAttribute("aria-label", `Delete note: ${note.title}`);
          addDeleteTooltip(remove, "Delete this post-it.");
          remove.addEventListener("click", () => deleteNote(note.id));
          item.append(pinButton(note), remove);
        }
        cards.append(item);
      });
      const add = button("add-here", "＋ Add note");
      add.setAttribute("aria-label", `Add note to ${name}`);
      add.addEventListener("click", () => openNote(index));
      section.append(heading, cards, add);
      return section;
    }));
  }

  function showLayoutFields() {
    get("section-fields").hidden = boardFields.layout.value !== "sections";
    get("weekend-field").hidden = boardFields.layout.value !== "week";
  }

  function showColorFields() {
    const mode = boardFields.colorMode.value;
    const help = {
      priority: "These four labels will be used across the board.",
      people: "Enter a team member for each color you want to use.",
      custom: "Enter a meaning for each color you want to use.",
      none: "Every note will use the same color."
    };
    const fields = get("color-fields");
    get("color-help").textContent = help[mode];
    fields.replaceChildren();
    if (mode === "priority") {
      Object.entries(priorities).forEach(([color, label]) => fields.append(colorLabel(color, label)));
    }
    if (mode === "people" || mode === "custom") {
      Object.entries(palette).forEach(([color, detail]) => {
        const label = element("label");
        const input = element("input");
        input.name = `color-${color}`;
        input.maxLength = 40;
        label.append(colorLabel(color, detail.name, mode), input);
        fields.append(label);
      });
    }
  }

  function boardError(message) {
    const notice = get("board-error");
    notice.textContent = message;
    notice.hidden = !message;
  }

  function getSections(layout) {
    if (layout === "open") return ["Notes"];
    if (layout === "week") {
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      if (boardFields.weekend.checked) days.push("Saturday", "Sunday");
      return days;
    }
    return boardFields.sections.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  }

  function getColors(mode) {
    if (mode === "priority") return priorities;
    return Object.fromEntries(Object.keys(palette).map((color) => [
      color, boardFields.namedItem(`color-${color}`)?.value.trim()
    ]).filter(([, label]) => label));
  }

  function openNote(section, note) {
    const board = activeBoard();
    noteForm.reset();
    noteFields.title.setCustomValidity("");
    editingNoteId = note?.id ?? null;
    get("note-dialog-title").textContent = note ? "Edit note" : "Add note";
    get("delete-note").hidden = !note;
    noteFields.title.value = note?.title ?? "";
    noteFields.body.value = note?.body ?? "";
    noteFields.section.replaceChildren(...board.sections.map((name, index) => new Option(name, index)));
    noteFields.section.value = section;
    get("note-section-field").hidden = board.sections.length < 2;
    const choices = Object.entries(board.colors);
    noteFields.color.replaceChildren(...choices.map(([color, label]) => new Option(`${palette[color].name} · ${label}`, color)));
    noteFields.color.value = note?.color ?? choices[0]?.[0] ?? "";
    get("note-color-field").hidden = !choices.length;
    noteDialog.showModal();
    noteFields.title.focus();
  }

  function exportBoard() {
    const board = activeBoard();
    if (!board) return;
    const sheet = get("print-sheet");
    const legend = element("div", "print-legend");
    fillLegend(legend, board);
    sheet.replaceChildren(element("h1", "", board.title));
    if (board.description) sheet.append(element("p", "print-meta", board.description));
    sheet.append(legend);
    board.sections.forEach((name, index) => {
      const section = element("section");
      section.append(element("h2", "", name));
      const notes = board.notes.filter((note) => note.section === index);
      if (!notes.length) section.append(element("p", "print-meta", "No notes"));
      notes.forEach((note) => {
        const card = element("article", "print-note");
        setPaper(card, note.color, board.colorMode);
        card.append(element("strong", "", note.title));
        if (note.body) card.append(element("p", "", note.body));
        if (note.color) card.append(element("span", "note-label", board.colors[note.color]));
        section.append(card);
      });
      sheet.append(section);
    });
  }

  render();
  if (preview) {
    document.documentElement.dataset.preview = "true";
    document.querySelector(".workspace").inert = true;
    return;
  }

  const handwritingToggle = get("handwriting-toggle");
  function applyNoteFont(font) {
    document.documentElement.dataset.noteFont = font;
    handwritingToggle.setAttribute("aria-pressed", String(font === "handwriting"));
  }

  try {
    applyNoteFont(localStorage.getItem(noteFontKey) === "standard" ? "standard" : "handwriting");
  } catch (error) {
    console.warn("Could not load the post-it font preference.", error);
  }
  handwritingToggle.addEventListener("click", () => {
    const font = handwritingToggle.getAttribute("aria-pressed") === "true" ? "standard" : "handwriting";
    applyNoteFont(font);
    try {
      localStorage.setItem(noteFontKey, font);
    } catch (error) {
      console.warn("Could not save the post-it font preference.", error);
      storageMessage("The font changed, but your preference couldn’t be saved to this browser.");
    }
  });

  get("new-board").addEventListener("click", () => {
    boardForm.reset();
    boardError("");
    showLayoutFields();
    showColorFields();
    boardDialog.showModal();
    boardFields.title.focus();
  });
  boardFields.layout.addEventListener("change", showLayoutFields);
  boardFields.colorMode.addEventListener("change", showColorFields);
  boardForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = boardFields.title.value.trim();
    const layout = boardFields.layout.value;
    const colorMode = boardFields.colorMode.value;
    const sections = getSections(layout);
    const colors = getColors(colorMode);
    if (!title) return boardError("Enter a board name.");
    if (!sections.length) return boardError("Enter at least one section name.");
    if (colorMode !== "none" && !Object.keys(colors).length) {
      return boardError("Give at least one color a label.");
    }
    const board = {
      id: makeId(), title, layout, colorMode, sections, colors,
      description: boardFields.description.value.trim(), notes: []
    };
    boardDialog.close();
    save({ boards: [...state.boards, board], activeId: board.id });
    get("canvas").scrollLeft = 0;
  });

  get("new-note").addEventListener("click", () => openNote(0));
  noteFields.title.addEventListener("input", () => noteFields.title.setCustomValidity(""));
  noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = noteFields.title.value.trim();
    if (!title) {
      noteFields.title.setCustomValidity("Enter a note title.");
      noteFields.title.reportValidity();
      return;
    }
    const note = {
      id: editingNoteId ?? makeId(),
      title,
      body: noteFields.body.value.trim(),
      section: Number(noteFields.section.value),
      color: noteFields.color.value
    };
    const notes = activeBoard().notes;
    noteDialog.close();
    updateNotes(editingNoteId ? notes.map((entry) => entry.id === note.id ? { ...entry, ...note } : entry) : [...notes, note]);
    get("new-note").focus();
  });
  function deleteNote(noteId) {
    if (!window.confirm("Delete this note?")) return;
    if (noteDialog.open) noteDialog.close();
    updateNotes(activeBoard().notes.filter((note) => note.id !== noteId));
    get("new-note").focus();
  }

  get("delete-note").addEventListener("click", () => deleteNote(editingNoteId));

  document.querySelectorAll("[data-close]").forEach((control) => {
    control.addEventListener("click", () => control.closest("dialog").close());
  });
  window.addEventListener("beforeprint", exportBoard);
  get("export").addEventListener("click", () => {
    exportBoard();
    const pageTitle = document.title;
    document.title = activeBoard().title;
    try {
      window.print();
    } finally {
      document.title = pageTitle;
    }
  });
})();
