(() => {
  "use strict";

  const REPOSITORY_TREE_URL = "https://api.github.com/repos/RittickDatta/prompt-projects/git/trees/main?recursive=1";
  const PROJECTS_KEY = "prompt-projects.view.v1";
  const THEME_KEY = "prompt-projects.theme.v1";
  const PALETTE_KEY = "prompt-projects.palette.v2";
  const knownProjects = {
    "brainstorm-app": {
      name: "Brainstorm",
      category: "Productivity",
      summary: "Plan projects or map your week on a color-coded post-it board.",
      benefit: "Group ideas into sections and share the finished board as a PDF."
    },
    "todo-app": {
      name: "Daymark",
      category: "Productivity",
      summary: "Organize tasks by status, due date, priority, and difficulty.",
      benefit: "A clear next step makes it easier to focus and celebrate what you've finished."
    },
    "checklist-app": {
      name: "Goodlist",
      category: "Productivity",
      summary: "Create checklists, add small reminders, and check off each step as you go.",
      benefit: "A friendly way to keep routines and multi-step plans feeling manageable."
    }
  };
  const fallbackProjects = Object.entries(knownProjects).map(([folder, details]) => ({ folder, ...details }));
  const elements = {
    grid: document.querySelector("#project-grid"),
    search: document.querySelector("#project-search"),
    category: document.querySelector("#category-filter"),
    count: document.querySelector("#project-count"),
    results: document.querySelector("#results-label"),
    note: document.querySelector("#discovery-note"),
    empty: document.querySelector("#no-projects"),
    gridButton: document.querySelector("#grid-view-button"),
    listButton: document.querySelector("#list-view-button"),
    themeToggle: document.querySelector("#theme-toggle"),
    paletteToggle: document.querySelector("#palette-toggle"),
    refreshButton: document.querySelector("#refresh-projects")
  };
  let projects = [];
  let currentView = readViewPreference();

  function readViewPreference() {
    try {
      return localStorage.getItem(PROJECTS_KEY) === "list" ? "list" : "grid";
    } catch (error) {
      console.error("Could not read the project layout preference.", error);
      return "grid";
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function titleFromFolder(folder) {
    return folder.split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }

  function titleFromPageTitle(title, folder) {
    const cleanTitle = title.split(/\s+[—|]\s+/)[0].trim();
    return cleanTitle || titleFromFolder(folder);
  }

  async function getProjectMetadata(folder) {
    try {
      const response = await fetch(`./${encodeURIComponent(folder)}/index.html`, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Could not read ${folder}/index.html (${response.status}).`);
      const markup = await response.text();
      const parsed = new DOMParser().parseFromString(markup, "text/html");
      return {
        title: parsed.querySelector("title")?.textContent?.trim() || titleFromFolder(folder),
        description: parsed.querySelector('meta[name="description"]')?.content?.trim() || ""
      };
    } catch (error) {
      console.warn(`Could not read metadata for project "${folder}".`, error);
      return { title: titleFromFolder(folder), description: "" };
    }
  }

  async function discoverProjects() {
    elements.refreshButton.classList.add("is-loading");
    elements.refreshButton.disabled = true;
    elements.note.hidden = true;
    elements.results.textContent = "Finding the good stuff...";

    try {
      const response = await fetch(REPOSITORY_TREE_URL, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
      const treeData = await response.json();
      if (!Array.isArray(treeData.tree) || treeData.truncated) {
        throw new Error("The project folder list could not be read completely.");
      }

      const folders = [...new Set(treeData.tree
        .map((entry) => entry.path.match(/^([^/]+)\/index\.html$/))
        .filter((match) => match && !match[1].startsWith("."))
        .map((match) => match[1]))];
      const treePaths = new Set(treeData.tree.map((entry) => entry.path));
      const found = await Promise.all(folders.map(async (folder) => {
        const page = await getProjectMetadata(folder);
        const preset = knownProjects[folder];
        const rawTitle = titleFromPageTitle(page.title, folder);
        const previewFile = ["preview.png", "preview.jpg", "preview.jpeg", "preview.webp", "screenshot.png", "screenshot.jpg", "screenshot.jpeg", "screenshot.webp"]
          .find((file) => treePaths.has(`${folder}/${file}`));
        return {
          folder,
          name: preset ? preset.name : rawTitle,
          category: preset ? preset.category : "Utility",
          summary: preset ? preset.summary : (page.description || `${rawTitle} is a small, focused web tool built to make an everyday task a little easier.`),
          benefit: preset ? preset.benefit : "A straightforward helper for keeping everyday plans moving, one step at a time.",
          href: `./${encodeURIComponent(folder)}/index.html`,
          previewMode: Boolean(preset),
          previewImage: previewFile ? `./${encodeURIComponent(folder)}/${encodeURIComponent(previewFile)}` : ""
        };
      }));

      projects = found.sort((a, b) => a.name.localeCompare(b.name));
      elements.note.hidden = true;
      render();
      if (projects.length === 0) {
        elements.results.textContent = "No project folders with an index.html yet.";
      } else {
        elements.results.textContent = `${projects.length} ${projects.length === 1 ? "project" : "projects"} to make your day a little easier.`;
      }
    } catch (error) {
      console.error("Could not discover projects from the repository.", error);
      projects = fallbackProjects.map((project) => ({
        ...project,
        href: `./${project.folder}/index.html`,
        previewMode: true,
        previewImage: ""
      }));
      render();
      elements.note.textContent = "Couldn't refresh project folders just now. Here's the latest local project list; try again when you're connected.";
      elements.note.hidden = false;
      elements.results.textContent = `${projects.length} ${projects.length === 1 ? "project" : "projects"} on the shelf.`;
    } finally {
      elements.refreshButton.classList.remove("is-loading");
      elements.refreshButton.disabled = false;
    }
  }

  function projectCard(project) {
    const preview = project.previewImage
      ? `<img class="project-preview-image" src="${escapeHtml(project.previewImage)}" alt="" loading="lazy">`
      : project.previewMode
        ? `<iframe src="${escapeHtml(project.href)}?preview=1" title="Preview of ${escapeHtml(project.name)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe>`
        : `<div class="preview-placeholder" aria-hidden="true"><div class="placeholder-sheet"><span class="placeholder-heading"></span><span class="placeholder-line"></span><span class="placeholder-line short"></span><span class="placeholder-check"><i>✓</i><b></b></span><span class="placeholder-check"><i></i><b></b></span><span class="placeholder-check"><i></i><b></b></span></div><span class="placeholder-spark">✦</span></div>`;
    return `<article class="project-card">
      <a class="project-preview-link" href="${escapeHtml(project.href)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(project.name)} preview in a new tab">
        <div class="project-preview">
          <div class="preview-browser-bar" aria-hidden="true"><span></span><span></span><span></span><i>${escapeHtml(project.folder)}</i></div>
          ${preview}
          <span class="project-preview-badge">A LITTLE PREVIEW</span>
        </div>
      </a>
      <a class="project-link" href="${escapeHtml(project.href)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(project.name)} project in a new tab">
        <div class="project-body">
          <div class="project-meta"><span class="project-category">${escapeHtml(project.category)}</span><span class="project-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M7 7h10v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>
          <h3>${escapeHtml(project.name)}</h3>
          <p class="project-summary">${escapeHtml(project.summary)}</p>
          <p class="project-benefit"><span aria-hidden="true">✦</span>${escapeHtml(project.benefit)}</p>
        </div>
      </a>
    </article>`;
  }

  function updateCategoryOptions() {
    const selected = elements.category.value || "all";
    const categories = [...new Set(projects.map((project) => project.category))].sort((a, b) => a.localeCompare(b));
    elements.category.innerHTML = `<option value="all">All categories</option>${categories.map((category) =>
      `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
    if (categories.includes(selected)) elements.category.value = selected;
  }

  function render() {
    updateCategoryOptions();
    const query = elements.search.value.trim().toLocaleLowerCase();
    const selectedCategory = elements.category.value;
    const visible = projects.filter((project) => {
      const matchesCategory = selectedCategory === "all" || project.category === selectedCategory;
      const searchable = `${project.name} ${project.folder} ${project.category} ${project.summary} ${project.benefit}`.toLocaleLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });

    elements.grid.classList.toggle("is-list", currentView === "list");
    elements.grid.innerHTML = visible.map(projectCard).join("");
    elements.count.textContent = String(visible.length);
    elements.empty.hidden = visible.length > 0;
    elements.grid.hidden = visible.length === 0;
    elements.gridButton.classList.toggle("is-active", currentView === "grid");
    elements.gridButton.setAttribute("aria-pressed", String(currentView === "grid"));
    elements.listButton.classList.toggle("is-active", currentView === "list");
    elements.listButton.setAttribute("aria-pressed", String(currentView === "list"));
    if (projects.length && !query && selectedCategory === "all") {
      elements.results.textContent = `${projects.length} ${projects.length === 1 ? "project" : "projects"} to make your day a little easier.`;
    } else {
      elements.results.textContent = `Showing ${visible.length} of ${projects.length} ${projects.length === 1 ? "project" : "projects"}.`;
    }
  }

  function setView(view) {
    currentView = view;
    try {
      localStorage.setItem(PROJECTS_KEY, view);
    } catch (error) {
      console.error("Could not save the project layout preference.", error);
    }
    render();
  }

  elements.search.addEventListener("input", render);
  elements.category.addEventListener("change", render);
  elements.gridButton.addEventListener("click", () => setView("grid"));
  elements.listButton.addEventListener("click", () => setView("list"));
  elements.refreshButton.addEventListener("click", discoverProjects);
  document.querySelector("#clear-filters").addEventListener("click", () => {
    elements.search.value = "";
    elements.category.value = "all";
    render();
  });

  const storedTheme = (() => {
    try { return localStorage.getItem(THEME_KEY); }
    catch (error) {
      console.error("Could not read the theme preference.", error);
      return null;
    }
  })();
  const initialTheme = storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = initialTheme;
  elements.themeToggle.setAttribute("aria-label", `Switch to ${initialTheme === "light" ? "dark" : "light"} mode`);
  const storedPalette = (() => {
    try { return localStorage.getItem(PALETTE_KEY); }
    catch (error) {
      console.error("Could not read the color palette preference.", error);
      return null;
    }
  })();
  const initialPalette = storedPalette === "sunshine" ? "sunshine" : "signal";
  document.documentElement.dataset.palette = initialPalette;
  function updatePaletteToggleLabel(palette) {
    const label = `Switch to ${palette === "signal" ? "sunshine" : "signal"} palette`;
    elements.paletteToggle.setAttribute("aria-label", label);
    elements.paletteToggle.title = label;
  }
  updatePaletteToggleLabel(initialPalette);

  elements.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    elements.themeToggle.setAttribute("aria-label", `Switch to ${nextTheme === "light" ? "dark" : "light"} mode`);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.error("Could not save the theme preference.", error);
    }
  });
  elements.paletteToggle.addEventListener("click", () => {
    const nextPalette = document.documentElement.dataset.palette === "signal" ? "sunshine" : "signal";
    document.documentElement.dataset.palette = nextPalette;
    updatePaletteToggleLabel(nextPalette);
    try {
      localStorage.setItem(PALETTE_KEY, nextPalette);
    } catch (error) {
      console.error("Could not save the color palette preference.", error);
    }
  });

  discoverProjects();
})();
