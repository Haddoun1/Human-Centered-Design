(function () {
  const annotations = {};
  let activeKey = null;
  let lastFocusedSentence = null;

  function escHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function splitSentences(text) {
    const raw = text.replace(/\s+/g, " ").trim();
    const parts = [];
    const re = /[^.!?]*[.!?]+(?:\s|$)/g;
    let match;
    let lastIndex = 0;

    while ((match = re.exec(raw)) !== null) {
      parts.push(match[0].trim());
      lastIndex = re.lastIndex;
    }

    const tail = raw.slice(lastIndex).trim();
    if (tail) parts.push(tail);

    return parts.filter((s) => s.length > 0);
  }

  function updateEmptyState() {
    const emptyState = document.getElementById("empty-state");
    const hasContent =
      Object.keys(annotations).length > 0 ||
      document.getElementById("active-input-card") !== null;
    emptyState.style.display = hasContent ? "none" : "flex";
  }

  function scrollToSentence(key) {
    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.scrollIntoView({ behavior: "smooth", block: "center" });
      span.focus();
    }
  }

  function buildSentenceSpans() {
    const paragraphs = document.querySelectorAll("#text-content p");

    paragraphs.forEach((p, pIdx) => {
      const sentences = splitSentences(p.textContent);
      p.innerHTML = "";

      sentences.forEach((sent, sIdx) => {
        const key = `p${pIdx}-s${sIdx}`;
        const span = document.createElement("span");

        span.setAttribute("tabindex", "0");
        span.className = "sentence";
        span.dataset.key = key;
        span.dataset.pIdx = pIdx;
        span.dataset.sIdx = sIdx;
        span.textContent = sent;

        span.insertAdjacentText("beforebegin", sIdx > 0 ? " " : "");

        span.addEventListener("click", () => selectSentence(key, span));
        span.addEventListener("focus", () => {
          lastFocusedSentence = key;
        });

        p.appendChild(span);
      });
    });
  }

  function selectSentence(key, span) {
    if (annotations[key]) {
      openEditMode(key);
      return;
    }

    if (activeKey && activeKey !== key) {
      document
        .querySelectorAll(".sentence")
        .forEach((s) => s.classList.remove("active-select"));
      removeInputCard();
    }

    activeKey = key;
    span.classList.add("active-select");

    const pIdx = parseInt(span.dataset.pIdx);
    const sIdx = parseInt(span.dataset.sIdx);

    showInputCard(key, pIdx, sIdx, span.textContent);
  }

  function showInputCard(key, pIdx, sIdx, sentText) {
    removeInputCard();
    updateEmptyState();

    const card = document.createElement("div");
    card.className = "annotation-input-card";
    card.id = "active-input-card";

    card.innerHTML = `
      <div class="ref-label">Alinea ${pIdx + 1} · Zin ${sIdx + 1}</div>
      <div class="sentence-preview">${escHtml(sentText)}</div>
      <textarea id="note-textarea" placeholder="" rows="3"></textarea>
      <div class="input-actions">
        <button class="btn btn-cancel" id="btn-cancel-annotation">Annuleer</button>
        <button class="btn btn-save"   id="btn-save-annotation">Opslaan</button>
      </div>
    `;

    const list = document.getElementById("annotation-list");
    list.insertBefore(card, list.firstChild);

    const textarea = card.querySelector("#note-textarea");
    textarea.focus();

    card.querySelector("#btn-save-annotation").addEventListener("click", () => {
      saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
    });

    card
      .querySelector("#btn-cancel-annotation")
      .addEventListener("click", cancelInput);

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
      }
      if (e.key === "Escape") cancelInput();
    });

    updateEmptyState();
  }

  function removeInputCard() {
    const existing = document.getElementById("active-input-card");
    if (existing) existing.remove();
  }

  function cancelInput() {
    if (activeKey) {
      const span = document.querySelector(`.sentence[data-key="${activeKey}"]`);
      if (span) span.classList.remove("active-select");
    }
    activeKey = null;
    removeInputCard();
    updateEmptyState();
  }

  function saveAnnotation(key, pIdx, sIdx, sentText, note) {
    if (!note) {
      cancelInput();
      return;
    }

    annotations[key] = { note, pIdx, sIdx, text: sentText };

    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.classList.remove("active-select");
      span.classList.add("annotated");
      span.dataset.notePreview =
        note.length > 50 ? note.slice(0, 50) + "…" : note;
    }

    activeKey = null;
    removeInputCard();
    renderAnnotationCard(key);
    updateEmptyState();
    focusPanel("reading");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Renders a saved annotation as an <li> with:
  //   - aria-label = "Alinea X · Zin Y: <sentence text>" so the SR reads the
  //     sentence immediately when the item receives focus
  //   - The note text in a <p>
  //   - A nested <ul role="list"> containing Bewerken and Verwijderen as <li>
  //     elements, each holding a <button>, so the SR announces them as list items
  // ─────────────────────────────────────────────────────────────────────────────
  function renderAnnotationCard(key) {
  const a = annotations[key];
  if (!a) return;

  const existing = document.querySelector(
    `.annotation-card[data-key="${key}"]`,
  );

  if (existing) existing.remove();

  const card = document.createElement("li");
  card.className = "annotation-card";
  card.dataset.key = key;

  const locationLabel = `Alinea ${a.pIdx + 1}, Zin ${a.sIdx + 1}`;

  card.innerHTML = `
    <div class="card-ref">
      ${locationLabel}
    </div>

    <!-- ZIN -->
    <div
      class="card-sentence"
      tabindex="0"
      role="article"
      aria-label="Geannoteerde zin"
    >
      ${escHtml(a.text)}
    </div>

    <!-- ANNOTATIE -->
    <div
      class="card-note"
      tabindex="0"
      role="article"
      aria-label="Annotatie"
    >
      ${escHtml(a.note)}
    </div>

    <!-- ACTIES -->
    <ul
      class="card-actions"
      role="list"
      aria-label="Acties voor annotatie"
    >
      <li>
        <button class="btn btn-edit">
          Bewerken
        </button>
      </li>

      <li>
        <button class="btn btn-delete">
          Verwijderen
        </button>
      </li>
    </ul>
  `;

  card
    .querySelector(".btn-edit")
    .addEventListener("click", () => openEditMode(key));

  card
    .querySelector(".btn-delete")
    .addEventListener("click", () => deleteAnnotation(key));

  card
    .querySelector(".card-sentence")
    .addEventListener("click", () => scrollToSentence(key));

  insertCardInOrder(card, a);
}

  function insertCardInOrder(card, annotation) {
    const list = document.getElementById("annotation-list");
    const cards = [...list.querySelectorAll(".annotation-card")];

    const insertBefore = cards.find((c) => {
      const existing = annotations[c.dataset.key];
      if (!existing) return false;
      return (
        existing.pIdx > annotation.pIdx ||
        (existing.pIdx === annotation.pIdx && existing.sIdx > annotation.sIdx)
      );
    });

    if (insertBefore) list.insertBefore(card, insertBefore);
    else list.appendChild(card);
  }

  function deleteAnnotation(key) {
    delete annotations[key];

    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.classList.remove("annotated", "active-select");
      delete span.dataset.notePreview;
    }

    const card = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (card) card.remove();

    updateEmptyState();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Edit mode: replaces the note <p> and action <ul> inside the existing <li>
  // with a textarea + save/cancel buttons.  The <li>'s aria-label stays intact
  // so the SR still announces the sentence when the item is browsed.
  // ─────────────────────────────────────────────────────────────────────────────
  function openEditMode(key) {
    const a = annotations[key];
    if (!a) return;

    removeInputCard();

    const existingCard = document.querySelector(
      `.annotation-card[data-key="${key}"]`,
    );
    if (!existingCard) return;

    const noteEl = existingCard.querySelector(".card-note");
    const actionsEl = existingCard.querySelector(".card-actions");

    const textarea = document.createElement("textarea");
    Object.assign(textarea.style, {
      width: "100%",
      background: "#1a1a2e",
      border: "1.5px solid var(--accent)",
      borderRadius: "5px",
      color: "var(--text)",
      fontFamily: "var(--font-ui)",
      fontSize: "0.83rem",
      lineHeight: "1.5",
      padding: "0.5rem 0.65rem",
      resize: "vertical",
      minHeight: "70px",
      marginTop: "0.4rem",
    });
    textarea.value = a.note;
    textarea.setAttribute("aria-label", "Annotatie bewerken");

    // Keep action buttons in a <ul> even during edit mode
    const actions = document.createElement("ul");
    actions.className = "card-actions";
    actions.setAttribute("role", "list");
    actions.setAttribute("aria-label", "Acties voor bewerken");
    actions.innerHTML = `
      <li><button class="btn btn-cancel" style="font-size:0.72rem;padding:0.25rem 0.65rem;border:1.5px solid var(--border);background:transparent;color:var(--muted)">Annuleer</button></li>
      <li><button class="btn btn-save"   style="font-size:0.72rem;padding:0.25rem 0.65rem">Opslaan</button></li>
    `;

    noteEl.replaceWith(textarea);
    actionsEl.replaceWith(actions);
    textarea.focus();

    actions.querySelector(".btn-save").addEventListener("click", () => {
      const newNote = textarea.value.trim();
      if (!newNote) {
        deleteAnnotation(key);
        return;
      }
      annotations[key].note = newNote;

      const span = document.querySelector(`.sentence[data-key="${key}"]`);
      if (span) {
        span.dataset.notePreview =
          newNote.length > 50 ? newNote.slice(0, 50) + "…" : newNote;
      }

      existingCard.remove();
      renderAnnotationCard(key);
      updateEmptyState();
    });

    actions.querySelector(".btn-cancel").addEventListener("click", () => {
      existingCard.remove();
      renderAnnotationCard(key);
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        actions.querySelector(".btn-save").click();
      }
      if (e.key === "Escape") actions.querySelector(".btn-cancel").click();
    });
  }

  let activePanel = "reading";

  function announce(message) {
    const region = document.getElementById("sr-announcer");
    if (!region) return;
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }

  function buildAnnouncerRegion() {
    const region = document.createElement("div");
    region.id = "sr-announcer";
    region.setAttribute("aria-live", "assertive");
    region.setAttribute("aria-atomic", "true");
    Object.assign(region.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clip: "rect(0,0,0,0)",
      whiteSpace: "nowrap",
    });
    document.body.appendChild(region);
  }

  function focusPanel(panel) {
    activePanel = panel;

    if (panel === "reading") {
      const resumeKey = lastFocusedSentence || activeKey;
      const target =
        (resumeKey &&
          document.querySelector(`.sentence[data-key="${resumeKey}"]`)) ||
        document.querySelector(".sentence");
      if (target) target.focus();
      announce(
        "Leesvenster actief. " +
          "Gebruik Tab en Shift+Tab om door zinnen te navigeren. " +
          "Druk op Enter om een zin te annoteren. " +
          "Druk op de Alt + J toets om naar het annotatievenster te gaan.",
      );
    } else {
      const annotationPanel =
        document.getElementById("annotation-panel") ||
        document.getElementById("annotation-list");
      const firstFocusable = annotationPanel
        ? annotationPanel.querySelector(
            'button, textarea, input, [tabindex="0"]',
          )
        : null;
      if (firstFocusable) firstFocusable.focus();
      else if (annotationPanel) annotationPanel.focus();
      announce(
        "Annotatievenster actief. " +
          "Gebruik Tab en Shift+Tab om door annotaties te navigeren. " +
          "Druk op de Alt + J toets om terug te gaan naar het leesvenster.",
      );
    }
  }

  function trackActivePanelByFocus() {
    document.addEventListener("focusin", (e) => {
      const readingPanel = document.getElementById("text-content");
      const annotationPanel =
        document.getElementById("annotation-panel") ||
        document.getElementById("annotation-list");

      if (readingPanel && readingPanel.contains(e.target)) {
        activePanel = "reading";
      } else if (annotationPanel && annotationPanel.contains(e.target)) {
        activePanel = "annotation";
      }
    });
  }

  function announceStartupInstructions() {
    const contentAreas = [
      document.getElementById("text-content"),
      document.getElementById("annotation-panel") ||
        document.getElementById("annotation-list"),
      document.querySelector("header"),
      document.querySelector("main"),
      document.querySelector("h1"),
      document.querySelector("h2"),
      document.querySelector("nav"),
    ].filter(Boolean);

    contentAreas.forEach((el) => el.setAttribute("aria-hidden", "true"));

    setTimeout(() => {
      announce(
        "Welkom. " +
          "De pagina is verdeeld in twee vensters: een leesvenster en een annotatievenster. " +
          "Gebruik Tab en Shift+Tab om door zinnen in het leesvenster te navigeren. " +
          "Druk op Enter om een geselecteerde zin te annoteren. " +
          "Druk op Alt + J om te wisselen tussen het leesvenster en het annotatievenster.",
      );
    }, 300);

    setTimeout(() => {
      contentAreas.forEach((el) => el.removeAttribute("aria-hidden"));
    }, 5000);
  }

  buildAnnouncerRegion();
  buildSentenceSpans();
  updateEmptyState();
  trackActivePanelByFocus();
  document.addEventListener("keydown", handlePanelSwitch);
  announceStartupInstructions();

  function handlePanelSwitch(e) {
    const activeElement = document.activeElement;
    const tag = activeElement && activeElement.tagName.toLowerCase();
    const isTyping =
      tag === "textarea" || tag === "input" || activeElement.isContentEditable;

    if (isTyping) return;

    if (e.altKey && e.key.toLowerCase() === "j") {
      e.preventDefault();
      e.stopPropagation();
      if (activePanel === "reading") {
        focusPanel("annotation");
      } else {
        focusPanel("reading");
      }
    }
  }
})();