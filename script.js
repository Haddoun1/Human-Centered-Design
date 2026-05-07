(function () {

  // ─────────────────────────────────────────────────────────────────────────────
  // Bewaart alle opgeslagen annotaties en bijhoudt welke zin momenteel bewerkt wordt.
  // ─────────────────────────────────────────────────────────────────────────────

  const annotations = {}; // sleutel: "p{pIdx}-s{sIdx}" → { note, pIdx, sIdx, text }
  let activeKey = null;         // sleutel van de zin die momenteel geselecteerd is voor invoer
  let lastFocusedSentence = null; // sleutel van de laatste zin waar de gebruiker op was (ook zonder annotatie)


  // ─────────────────────────────────────────────────────────────────────────────
  // Escapet speciale HTML-tekens zodat gebruikerstekst veilig via innerHTML
  // kan worden ingevoegd. Mag worden verwijderd als je nooit gebruikersinhoud
  // via innerHTML invoegt.
  // ─────────────────────────────────────────────────────────────────────────────

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Splitst een tekstblok in afzonderlijke zinnen op basis van .!? leestekens.
  // Geeft een array van zinstrings terug.
  // ─────────────────────────────────────────────────────────────────────────────

  function splitSentences(text) {
    const raw = text.replace(/\s+/g, ' ').trim();
    const parts = [];
    const re = /[^.!?]*[.!?]+(?:\s|$)/g;
    let match;
    let lastIndex = 0;

    while ((match = re.exec(raw)) !== null) {
      parts.push(match[0].trim());
      lastIndex = re.lastIndex;
    }

    // Vang eventuele resterende tekst op zonder leesteken aan het einde
    const tail = raw.slice(lastIndex).trim();
    if (tail) parts.push(tail);

    return parts.filter(s => s.length > 0);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Toont of verbergt het "#empty-state" element afhankelijk van of er
  // annotaties zijn of een actieve invoerkaart. Roep aan na elke toevoeg-/
  // verwijderactie.
  // ─────────────────────────────────────────────────────────────────────────────

  function updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    const hasContent =
      Object.keys(annotations).length > 0 ||
      document.getElementById('active-input-card') !== null;
    emptyState.style.display = hasContent ? 'none' : 'flex';
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Scrolt de pagina vloeiend zodat de zinspan voor een bepaalde sleutel
  // zichtbaar is, en focust deze daarna voor toetsenbordgebruikers.
  // ─────────────────────────────────────────────────────────────────────────────

  function scrollToSentence(key) {
    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      span.focus();
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Leest elke <p> binnen #text-content, splitst de tekst in zinnen, en
  // vervangt de ruwe tekst door afzonderlijke <span class="sentence"> elementen.
  // Elke span krijgt klik- en toetsenbordhandlers die selectSentence() aanroepen.
  // ─────────────────────────────────────────────────────────────────────────────

  function buildSentenceSpans() {
    const paragraphs = document.querySelectorAll('#text-content p');

    paragraphs.forEach((p, pIdx) => {
      const sentences = splitSentences(p.textContent);
      p.innerHTML = '';

      sentences.forEach((sent, sIdx) => {
        const key = `p${pIdx}-s${sIdx}`;
        const span = document.createElement('button');

        span.className = 'sentence';
        span.dataset.key = key;
        span.dataset.pIdx = pIdx;
        span.dataset.sIdx = sIdx;
        // Geen aria-label nodig — de knop leest zijn eigen tekstinhoud voor,
        // en "knop" / "gebied klikbaar" aankondigingen zijn weggelaten.
        span.textContent = sent;

        // Voeg een spatie toe vóór elke zin behalve de eerste
        span.insertAdjacentText('beforebegin', sIdx > 0 ? ' ' : '');

        span.addEventListener('click', () => selectSentence(key, span));
        span.addEventListener('focus', () => { lastFocusedSentence = key; });

        p.appendChild(span);
      });
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Wordt aangeroepen wanneer de gebruiker op een zinspan klikt of Enter/Spatie
  // indrukt.
  // - Als de zin al een annotatie heeft → open bewerkingsmodus.
  // - Anders → deselecteer de vorige actieve zin, toon dan de invoerkaart.
  // ─────────────────────────────────────────────────────────────────────────────

  function selectSentence(key, span) {
    if (annotations[key]) {
      openEditMode(key);
      return;
    }

    // Deselecteer de vorige actieve zin als het een andere is
    if (activeKey && activeKey !== key) {
      document.querySelectorAll('.sentence').forEach(s => s.classList.remove('active-select'));
      removeInputCard();
    }

    activeKey = key;
    span.classList.add('active-select');

    const pIdx = parseInt(span.dataset.pIdx);
    const sIdx = parseInt(span.dataset.sIdx);

    showInputCard(key, pIdx, sIdx, span.textContent);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Voegt een tijdelijke kaart in bovenaan #annotation-list waar de gebruiker
  // zijn annotatie kan typen. Koppelt Opslaan / Annuleer knoppen en
  // Ctrl+Enter / Esc toetsen.
  // ─────────────────────────────────────────────────────────────────────────────

  function showInputCard(key, pIdx, sIdx, sentText) {
    removeInputCard(); // Verwijder eventuele bestaande kaart eerst
    updateEmptyState();

    const card = document.createElement('div');
    card.className = 'annotation-input-card';
    card.id = 'active-input-card';

    card.innerHTML = `
      <div class="ref-label">Alinea ${pIdx + 1} · Zin ${sIdx + 1}</div>
      <div class="sentence-preview">${escHtml(sentText)}</div>
      <textarea id="note-textarea" placeholder="" rows="3"></textarea>
      <div class="input-actions">
        <button class="btn btn-cancel" id="btn-cancel-annotation">Annuleer</button>
        <button class="btn btn-save"   id="btn-save-annotation">Opslaan</button>
      </div>
    `;

    const list = document.getElementById('annotation-list');
    list.insertBefore(card, list.firstChild);

    const textarea = card.querySelector('#note-textarea');
    textarea.focus();

    card.querySelector('#btn-save-annotation').addEventListener('click', () => {
      saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
    });

    card.querySelector('#btn-cancel-annotation').addEventListener('click', cancelInput);

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Gewone Enter slaat op; Shift+Enter voegt een nieuwe regel in (standaardgedrag)
        e.preventDefault();
        saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
      }
      if (e.key === 'Escape') cancelInput();
    });

    updateEmptyState();
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Verwijdert de actieve invoerkaart uit de DOM als die bestaat.
  // Op zichzelf staand — veilig aan te roepen ook als er geen kaart aanwezig is.
  // ─────────────────────────────────────────────────────────────────────────────

  function removeInputCard() {
    const existing = document.getElementById('active-input-card');
    if (existing) existing.remove();
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Verwijdert de actieve selectiemarkering, wist activeKey, verwijdert de
  // invoerkaart en werkt de lege-toestand melding bij.
  // ─────────────────────────────────────────────────────────────────────────────

  function cancelInput() {
    if (activeKey) {
      const span = document.querySelector(`.sentence[data-key="${activeKey}"]`);
      if (span) span.classList.remove('active-select');
    }
    activeKey = null;
    removeInputCard();
    updateEmptyState();
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Slaat een nieuwe annotatie op in het `annotations` object, markeert de
  // zinspan als geannoteerd en toont de opgeslagen annotatiekaart in de zijbalk.
  // Als de notitie leeg is, wordt geannuleerd in plaats van opgeslagen.
  // ─────────────────────────────────────────────────────────────────────────────

  function saveAnnotation(key, pIdx, sIdx, sentText, note) {
    if (!note) {
      cancelInput();
      return;
    }

    annotations[key] = { note, pIdx, sIdx, text: sentText };

    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.classList.remove('active-select');
      span.classList.add('annotated');
      span.dataset.notePreview = note.length > 50 ? note.slice(0, 50) + '…' : note;
    }

    activeKey = null;
    removeInputCard();
    renderAnnotationCard(key);
    updateEmptyState();
    // Geef focus terug aan het leesvenster zodat de gebruiker verder kan lezen
    focusPanel('reading');
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Maakt een opgeslagen annotatiekaart aan (of opnieuw aan) voor de gegeven
  // sleutel en voegt deze in volgorde in #annotation-list in (op alinea, dan zin).
  // Koppelt Bewerken / Verwijderen knoppen en klikken-om-te-scrollen op de kaart.
  // ─────────────────────────────────────────────────────────────────────────────

  function renderAnnotationCard(key) {
    const a = annotations[key];
    if (!a) return;

    // Verwijder eventuele bestaande kaart voor deze sleutel vóór het opnieuw renderen
    const existing = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.className = 'annotation-card';
    card.dataset.key = key;

    card.innerHTML = `
      <div class="card-ref">Alinea ${a.pIdx + 1} · Zin ${a.sIdx + 1}</div>
      <div class="card-sentence">${escHtml(a.text)}</div>
      <div class="card-note">${escHtml(a.note)}</div>
      <div class="card-actions">
        <button class="btn btn-edit">Bewerken</button>
        <button class="btn btn-delete">Verwijderen</button>
      </div>
    `;

    card.querySelector('.btn-edit').addEventListener('click', () => openEditMode(key));
    card.querySelector('.btn-delete').addEventListener('click', () => deleteAnnotation(key));

    // Klikken op de kaartinhoud (niet de knoppen) scrolt naar de zin in de tekst
    card.addEventListener('click', e => {
      if (!e.target.classList.contains('btn')) scrollToSentence(key);
    });

    // Voeg de kaart in leesvolgorde in
    insertCardInOrder(card, a);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Zoekt de juiste positie in #annotation-list om `card` in te voegen zodat
  // alle kaarten gesorteerd blijven op alinea-index, daarna zinindex.
  // ─────────────────────────────────────────────────────────────────────────────

  function insertCardInOrder(card, annotation) {
    const list = document.getElementById('annotation-list');
    const cards = [...list.querySelectorAll('.annotation-card')];

    const insertBefore = cards.find(c => {
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


  // ─────────────────────────────────────────────────────────────────────────────
  // Verwijdert een annotatie uit de toestand, haalt de markering van de zinspan
  // weg, verwijdert de kaart uit de zijbalk en werkt de lege-toestand bij.
  // ─────────────────────────────────────────────────────────────────────────────

  function deleteAnnotation(key) {
    delete annotations[key];

    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.classList.remove('annotated', 'active-select');
      delete span.dataset.notePreview;
    }

    const card = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (card) card.remove();

    updateEmptyState();
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Transformeert een bestaande opgeslagen annotatiekaart naar een inline
  // bewerkingsformulier. Vervangt de notitietekst en actieknoppen door een
  // textarea + Opslaan/Annuleer. Bij opslaan wordt `annotations` bijgewerkt en
  // de kaart opnieuw gerenderd. Bij annuleren wordt de kaart ongewijzigd
  // opnieuw gerenderd.
  // ─────────────────────────────────────────────────────────────────────────────

  function openEditMode(key) {
    const a = annotations[key];
    if (!a) return;

    removeInputCard(); // sluit eventuele zwevende invoerkaart

    const existingCard = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (!existingCard) return;

    // Vervang het notitie-element door een textarea
    const noteEl = existingCard.querySelector('.card-note');
    const actionsEl = existingCard.querySelector('.card-actions');

    const textarea = document.createElement('textarea');
    Object.assign(textarea.style, {
      width: '100%',
      background: '#1a1a2e',
      border: '1.5px solid var(--accent)',
      borderRadius: '5px',
      color: 'var(--text)',
      fontFamily: 'var(--font-ui)',
      fontSize: '0.83rem',
      lineHeight: '1.5',
      padding: '0.5rem 0.65rem',
      resize: 'vertical',
      minHeight: '70px',
      marginTop: '0.4rem',
    });
    textarea.value = a.note;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.innerHTML = `
      <button class="btn btn-cancel" style="font-size:0.72rem;padding:0.25rem 0.65rem;border:1.5px solid var(--border);background:transparent;color:var(--muted)">Annuleer</button>
      <button class="btn btn-save"   style="font-size:0.72rem;padding:0.25rem 0.65rem">Opslaan</button>
    `;

    noteEl.replaceWith(textarea);
    actionsEl.replaceWith(actions);
    textarea.focus();

    actions.querySelector('.btn-save').addEventListener('click', () => {
      const newNote = textarea.value.trim();
      if (!newNote) {
        deleteAnnotation(key);
        return;
      }
      annotations[key].note = newNote;

     
      const span = document.querySelector(`.sentence[data-key="${key}"]`);
      if (span) {
        span.dataset.notePreview = newNote.length > 50 ? newNote.slice(0, 50) + '…' : newNote;
      }

      existingCard.remove();
      renderAnnotationCard(key);
      updateEmptyState();
    });

    actions.querySelector('.btn-cancel').addEventListener('click', () => {
      existingCard.remove();
      renderAnnotationCard(key); 
    });

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Gewone Enter slaat op; Shift+Enter voegt een nieuwe regel in (standaardgedrag)
        e.preventDefault();
        actions.querySelector('.btn-save').click();
      }
      if (e.key === 'Escape') actions.querySelector('.btn-cancel').click();
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Bijhouden welk venster momenteel actief is: 'reading' of 'annotation'.
  // ─────────────────────────────────────────────────────────────────────────────

  let activePanel = 'reading'; // begin in het leesvenster


  // ─────────────────────────────────────────────────────────────────────────────
  // Stuurt een bericht naar de schermlezer via een aria-live regio zonder
  // focus te verplaatsen. Gebruikt 'assertive' zodat het de huidige spraak
  // onderbreekt. De inhoud wordt via requestAnimationFrame gewist en opnieuw
  // ingesteld zodat hetzelfde bericht herhalen toch een nieuwe aankondiging
  // activeert.
  // ─────────────────────────────────────────────────────────────────────────────

  function announce(message) {
    const region = document.getElementById('sr-announcer');
    if (!region) return;
    region.textContent = '';
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Maakt een visueel verborgen aria-live="assertive" element in de DOM aan.
  // Schermlezers bewaken dit element en spreken de inhoud uit wanneer het
  // verandert.
  // ─────────────────────────────────────────────────────────────────────────────

  function buildAnnouncerRegion() {
    const region = document.createElement('div');
    region.id = 'sr-announcer';
    region.setAttribute('aria-live', 'assertive');
    region.setAttribute('aria-atomic', 'true');
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(region);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Verplaatst toetsenbordfocus naar het gegeven venster ('reading' of
  // 'annotation') en kondigt aan wat de gebruiker daar kan doen.
  // ─────────────────────────────────────────────────────────────────────────────

  function focusPanel(panel) {
    activePanel = panel;

    if (panel === 'reading') {
      const resumeKey = lastFocusedSentence || activeKey;
      const target =
        (resumeKey && document.querySelector(`.sentence[data-key="${resumeKey}"]`)) ||
        document.querySelector('.sentence');
      if (target) target.focus();
      announce(
        'Leesvenster actief. ' +
        'Gebruik Tab en Shift+Tab om door zinnen te navigeren. ' +
        'Druk op Enter om een zin te annoteren. ' +
        'Druk op de K-toets om naar het annotatievenster te gaan.'
      );
    } else {
      const annotationPanel =
        document.getElementById('annotation-panel') ||
        document.getElementById('annotation-list');
      const firstFocusable = annotationPanel
        ? annotationPanel.querySelector('button, textarea, input, [tabindex="0"]')
        : null;
      if (firstFocusable) firstFocusable.focus();
      else if (annotationPanel) annotationPanel.focus();
      announce(
        'Annotatievenster actief. ' +
        'Gebruik Tab en Shift+Tab om door annotaties te navigeren. ' +
        'Druk op de K-toets om terug te gaan naar het leesvenster.'
      );
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Globale keydown-luisteraar. alt J schakelt naar het annotatievenster,
  // nogmaals alt J schakelt terug naar lezen — maar alleen wanneer de focus NIET
  // in een textarea of tekstinvoer staat zodat de gebruiker nog steeds vrij
  // tekst kan typen.
  // ─────────────────────────────────────────────────────────────────────────────

 function handlePanelSwitch(e) {

  // Nooit sneltoetsen onderscheppen terwijl de gebruiker typt
  const activeElement = document.activeElement;
  const tag = activeElement && activeElement.tagName.toLowerCase();

  const isTyping =
    tag === 'textarea' ||
    tag === 'input' ||
    activeElement.isContentEditable;

  if (isTyping) return;


  // ALT + J schakelt tussen lees- en annotatievenster
  if (e.altKey && e.key.toLowerCase() === 'j') {

    e.preventDefault();
    e.stopPropagation();

    // Schakelen tussen de twee panelen
    if (activePanel === 'reading') {
      focusPanel('annotation');
    } else {
      focusPanel('reading');
    }
  }
}

  // ─────────────────────────────────────────────────────────────────────────────
  // Houdt `activePanel` gesynchroniseerd wanneer de gebruiker handmatig focus
  // verplaatst (bijv. met de muis of Tab) zodat K altijd in de juiste richting
  // schakelt.
  // ─────────────────────────────────────────────────────────────────────────────

  function trackActivePanelByFocus() {
    document.addEventListener('focusin', e => {
      const readingPanel = document.getElementById('text-content');
      const annotationPanel =
        document.getElementById('annotation-panel') ||
        document.getElementById('annotation-list');

      if (readingPanel && readingPanel.contains(e.target)) {
        activePanel = 'reading';
      } else if (annotationPanel && annotationPanel.contains(e.target)) {
        activePanel = 'annotation';
      }
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Wacht een kort moment na het laden van de pagina en leest de instructies
  // eenmaal voor zodat de gebruiker weet hoe het hulpmiddel werkt voordat hij
  // door de tekst begint te tabben.
  // ─────────────────────────────────────────────────────────────────────────────

  function announceStartupInstructions() {
    // Verberg de pagina-inhoud direct uit de toegankelijkheidsstructuur zodat
    // de schermlezer bij het laden geen koppen, alinea's of andere elementen
    // voorleest. De instructies worden via de live regio ingevoegd.
    // aria-hidden wordt na de instructies verwijderd (~4 s).
    const contentAreas = [
      document.getElementById('text-content'),
      document.getElementById('annotation-panel') || document.getElementById('annotation-list'),
      document.querySelector('header'),
      document.querySelector('main'),
      document.querySelector('h1'),
      document.querySelector('h2'),
      document.querySelector('nav'),
    ].filter(Boolean);

    contentAreas.forEach(el => el.setAttribute('aria-hidden', 'true'));

    setTimeout(() => {
      announce(
        'Welkom. ' +
        'De pagina is verdeeld in twee vensters: een leesvenster en een annotatievenster. ' +
        'Gebruik Tab en Shift+Tab om door zinnen in het leesvenster te navigeren. ' +
        'Druk op Enter om een geselecteerde zin te annoteren. ' +
        'Druk op Alt + J om te wisselen tussen het leesvenster en het annotatievenster.'
      );
    }, 300);

    // Herstel de inhoudsgebieden nadat de instructies tijd hebben gehad om voor te worden gelezen
    setTimeout(() => {
      contentAreas.forEach(el => el.removeAttribute('aria-hidden'));
    }, 5000);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // Startpunt. Bouwt de zinspans, stelt vensternavigatie in en leest de
  // opstartinstructies voor via de schermlezer.
  // ─────────────────────────────────────────────────────────────────────────────

  buildAnnouncerRegion();
  buildSentenceSpans();
  updateEmptyState();
  trackActivePanelByFocus();
  document.addEventListener('keydown', handlePanelSwitch);
  announceStartupInstructions();

})();