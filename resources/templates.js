import { html, render } from './../libs/lit/lit.js';
export { render };

/**
 * templates.js
 *
 * Bereinigungen / Bugfixes gegenüber der vorherigen Version:
 * - Kaputte Lit-Bindings repariert: mehrfach stand `${fn}}` statt `${fn}` bei @click/@input
 *   (überzähliges `}` direkt nach der Interpolation), u. a. bei den vier Buttons in der
 *   Kopfzeile der Frontpage sowie bei den Filter-Inputs "werkzeug", "author", "kategorie".
 * - Fehlende `</div>` für ".component" in frontpage() und appTile() ergänzt.
 * - Verwaistes `</img>` in frontpage() entfernt (kein passendes <img> vorhanden, <img> ist
 *   ohnehin ein Void-Element und braucht kein schließendes Tag).
 * - Mehrere Stellen haben HTML als reinen JS-String interpoliert (`<span>...</span>` statt
 *   html`<span>...</span>`). Lit escaped normale Strings automatisch, dadurch wurde z. B. bei
 *   Tags, dem Picture-Link und ignore.meta der rohe Tag-Text angezeigt statt echtem HTML.
 *   Jetzt überall echte Lit-Templates statt String-Konkatenation - korrekt UND sicherer,
 *   da Lit die eingebetteten Werte weiterhin automatisch escaped (kein XSS-Risiko wie bei
 *   einer pauschalen unsafeHTML-Lösung).
 * - componentSite: `agree`/`ignore` wurden zwar mit Fallback `{}` lokal angelegt, im Template
 *   aber trotzdem `data.agree.*`/`data.ignore.*` direkt verwendet -> Absturz, falls die Felder
 *   fehlen. Jetzt konsequent über die lokalen `agree`/`ignore`-Variablen.
 * - componentSite: `data._`/`data._.access` werden jetzt garantiert initialisiert (auf dem
 *   echten `data`-Objekt, nicht auf einer Kopie), damit `alterRights()` seine Änderungen
 *   tatsächlich persistiert, wenn später `instance.updateData(data)` aufgerufen wird.
 * - Tote Funktion `renderIgnoreConfig` entfernt (war nirgends aufgerufen und hatte denselben
 *   String-statt-html-Bug).
 * - Positions-Index-Bug behoben: `instance.myFunction(index, comp)` nutzte den Index im
 *   angezeigten (ggf. gefilterten/sortierten) Array statt den echten Index in
 *   `instance.datasets`. Neue Hilfsfunktion `resolveDatasetIndex()` sucht stattdessen über
 *   den App-Key - robust auch bei gefilterten/sortierten Listen.
 * - frontpage(): Die Such-/Filterleiste hat bisher nichts getan (nur console.log). Jetzt
 *   filtert und sortiert sie tatsächlich; das Ergebnis-Grid wurde in eine eigene Funktion
 *   componentGrid() ausgelagert, damit bei Eingaben nur das Grid neu gerendert wird statt
 *   der ganzen Seite (Fokus im Input bleibt erhalten).
 * - Diverse console.log-Debug-Ausgaben entfernt.
 * - Null-Checks bei DOM-Zugriffen (querySelector kann null liefern) ergänzt, u. a. in
 *   renderConfig(), alterRights() und der Hover-Preview in commentTile().
 * - frontpage(): Die fünf "Lade andere Daten"-Buttons und der zugehörige Hinweistext waren
 *   als lose Kinder in einem Container ohne Layout-Regeln aufgereiht (nur einzeln per
 *   margin-top getrennt) und liefen dadurch optisch ineinander. Buttons stecken jetzt in
 *   einem eigenen ".ladeandere_buttons"-Wrapper (Flex-Spalte, einheitliche Breite, klarer
 *   Abstand), der Hinweistext in einem eigenen "<p class=ladeandere_hint">" darüber.
 * - papierkorbSite(): Überschrift und Beschreibungstext nutzten dieselben Klassen wie die
 *   Frontpage-Headline (".datacockpit_landingpage_head" / "..._description"), die dort aber
 *   Teil eines Zwei-Spalten-Grids sind (width: 50%, margin-right: 2vw). Im zentrierten
 *   Papierkorb-Header führte das zu einem Versatz nach links, während der Leeren-Button
 *   (eigene Klasse) korrekt zentriert blieb. Jetzt eigene Klassen ".papierkorb_head" /
 *   ".papierkorb_description" ohne die Grid-spezifischen Breiten-/Abstandsregeln.
 * - style.css ".papierkorb_header": eigentliche Ursache des verbleibenden Linksversatzes war,
 *   dass ".component_site_container" (von der Übersicht-Karte mitgenutzt) "grid-column: 1/3"
 *   setzt und dadurch im Papierkorb-Grid zwei implizite Spalten entstehen. ".papierkorb_header"
 *   hatte kein eigenes "grid-column" und landete deshalb nur in der ersten (linken) Spalte,
 *   während die Übersicht über beide Spalten ging und dadurch die volle Breite nutzte. Jetzt
 *   spannt ".papierkorb_header" per "grid-column: 1/3" ebenfalls über beide Spalten.
 * - Neue Funktion pageHeader() ersetzt jetzt ".datacockpit_landingpage_head/_description" UND
 *   ".papierkorb_head/_description" vollständig: Alle Unterseiten (frontpage, appLikesSite,
 *   commentLikesSite, papierkorbSite) hatten bislang entweder denselben nichtssagenden Titel
 *   "Data-Cockpit" oder - je nach umgebendem Grid der jeweiligen Seite - eine unterschiedlich
 *   positionierte Überschrift (siehe Bugfix oben). pageHeader() ist layoutunabhängig immer
 *   gleich zentriert und bekommt pro Seite einen eigenen, aussagekräftigen Titel.
 * - commentLikesSite(comp, instance, commentType): Der dritte Parameter war ein reines Boolean
 *   und konnte deshalb nur zwei Fälle unterscheiden, obwohl die Funktion von drei fachlich
 *   verschiedenen Seiten aufgerufen wird (renderCommentRatingsSite, renderComments,
 *   renderCommentComponentCommentRatingsSite). Die letzten beiden erhielten dadurch denselben
 *   Text, obwohl "eigene verfasste Kommentare" und "Likes auf Kommentar-Komponenten" inhaltlich
 *   nichts miteinander zu tun haben. Parameter jetzt ein String ("commentRatings" /
 *   "commentComponentRatings" / "comments"), der dieselben Schlüssel wie valuableApps nutzt.
 */

/**
 * Ermittelt anhand des App-Keys den tatsächlichen Index in instance.datasets.
 * Robuster als sich auf die Position im angezeigten (ggf. gefilterten/sortierten)
 * Array zu verlassen.
 */
/**
 * Einheitliche Leeransicht ("Empty State") für alle Unterseiten.
 *
 * Zweck: Eine Unterseite soll nie voellig leer wirken. Statt eines leeren
 * Containers erklärt der Empty State, WARUM nichts angezeigt wird und was
 * der Nutzer tun kann. Alle Seiten verwenden bewusst denselben Baustein,
 * damit die Darstellung konsistent bleibt.
 *
 * @param {string} title  Kurze Hauptaussage
 * @param {string} [hint] Optionaler erklärender Zusatz
 * @param {string} [icon] Optionales Symbol
 */
export function emptyState(title, hint = "", icon = "\u{1F4ED}") {
    return html`
        <div class="empty_state">
            <div class="empty_state_icon" aria-hidden="true">${icon}</div>
            <p class="empty_state_title">${title}</p>
            ${hint ? html`<p class="empty_state_hint">${hint}</p>` : ""}
        </div>
    `;
}

/**
 * Einheitliche Seitenüberschrift für alle Unterseiten des Data Cockpit.
 *
 * Ersetzt die vormals mehrfach dupliziert eingebettete, immer gleichlautende
 * Überschrift "Data-Cockpit". Jede Unterseite bekommt jetzt einen eigenen,
 * aussagekräftigen Titel, ist aber unabhängig vom umgebenden Grid/Flex-Layout
 * der jeweiligen Seite IMMER identisch zentriert (siehe ".page_header" in
 * style.css) - der bisherige Linksversatz auf appLikesSite/commentLikesSite
 * entstand dadurch, dass die alte Überschrift auf das zweispaltige Grid der
 * Frontpage angewiesen war, das auf anderen Seiten schlicht nicht existierte.
 *
 * @param {string} title        Seitenspezifischer Titel
 * @param {string} [description] Optionale erklärende Unterzeile
 */
export function pageHeader(title, description = "") {
    return html`
        <div class="page_header">
            <h2 class="page_header_title">${title}</h2>
            ${description ? html`<p class="page_header_description">${description}</p>` : ""}
        </div>
    `;
}

function resolveDatasetIndex(comp, instance) {
    const appKey = comp?.Config?.app;
    if (appKey === undefined || !Array.isArray(instance?.datasets)) return -1;
    return instance.datasets.findIndex(d => d.app === appKey);
}

/**
 * Home-Button - wird auf jeder Seite oben links eingeblendet und rendert per
 * instance.renderFrontpage() wieder die Startseite (Frontpage). Als "position: fixed"
 * gestylt (siehe style.css, .home_button), damit er unabhängig vom Grid-Layout der
 * jeweiligen Seite immer an derselben Stelle sitzt.
 */
function homeButton(instance) {
    return html`
        <button class="home_button" title="Zur Startseite" @click=${() => instance.renderFrontpage()}>
            🏠 Home
        </button>
    `;
}

export function detail(app) {
    return html`
        <div>
            <h2>${app.title}</h2>
            <p>${app.description || ""}</p>

            <button @click=${() => location.reload()}>
                zurück
            </button>
        </div>
    `;
}

export function mainLogin() {
    return html`
        <div class="d-flex justify-content-end p-3">
            <div id="user"></div>
        </div>
        <main class="container d-flex flex-column justify-content-center align-items-center vh-100">
            <div class="card shadow-lg p-4">
                <div class="card-body">
                    <h1 class="card-title text-center mb-4">Welcome</h1>
                    <p class="lead text-center text-muted">Login to view your data of Digital Makerspace apps here.</p>
                </div>
            </div>
        </main>
    `;
}

export function componentSite(data, comp, instance) {

    // State merken ob die Config geladen wurde
    let configLoaded = false;

    data = data || {};

    // Auf dem ECHTEN data-Objekt initialisieren (nicht auf einer Kopie), damit Änderungen
    // über alterRights() später via instance.updateData(data) tatsächlich gespeichert werden.
    data._ = data._ || {};
    data._.access = data._.access || {};
    data.agree = data.agree || {};
    data.ignore = data.ignore || {};

    const agree = data.agree;
    const ignore = data.ignore;
    const meta = data._;
    const key = Array.isArray(data.key) ? data.key.join(' / ') : (data.key || '–');

    //rekursive Funktion um Arrays und Objekte die in der JSON der Komponente liegen iterativ auszugeben und auf den Bildschirm zu projizieren
    const checkArray = (item) => {
        //wenn das item ein Object ist wird jedes Schlüssel/Wert Paar iterativ ausgegeben und jeder Wert wird darauf geprüft ob es ein Array ist
        if (typeof item === 'object' && !Array.isArray(item) && item !== null) {
            return html`
                ${Object.entries(item).map(([schlüssel, wert]) => html`
                    <div>
                        <strong>${schlüssel}:</strong>
                        ${checkArray(wert)}
                    </div>
                `)}
            `;
        }

        //Wenn das Item ein Array ist wird jedes Item aus dem Array zurückgegeben, nachdem es selbst rekursiv geprüft wurde
        if (Array.isArray(item)) {
            return html`
                <ul>
                    ${item.map(interItem => html`
                        <li>${checkArray(interItem)}</li>
                    `)}
                </ul>
            `;
        }

        return item;
    };

    //Dropdown Menü um die Nutzerrechte get set del zu ändern
    const dropdownMenu = (type) => {
        return html`
            <div class="dropdown_container">
                <button @click=${() => alterRights(type, "creator")}> creator </button> <br>
                <button @click=${() => alterRights(type, "all")}> all </button> <br>
            </div>
        `;
    };

    const alterRights = (type, right) => {
        data._.access[type] = right; // das richtige Schlüssel-Wert-Paar erneuern (persistiert über data._)
        const target = instance.element?.querySelector(`#${type}`);
        if (target) {
            target.innerHTML = right;
        } else {
            console.warn(`[componentSite] alterRights: Element #${type} nicht gefunden.`);
        }
    };

    const renderConfig = () => { // Lädt die Config-Seite, indem sie sichtbar gemacht wird
        const comment = instance.element?.querySelector(".comment_site_container");
        const component = instance.element?.querySelector(".component_site_container");
        const configButton = instance.element?.querySelector("#load_config_button");

        if (!comment || !component || !configButton) {
            console.warn("[componentSite] renderConfig: benötigte Elemente nicht gefunden.");
            return;
        }

        if (!configLoaded) {
            comment.style.display = "grid";
            component.style.gridColumn = "1/2";
            configButton.replaceChildren("Config verbergen");
            configLoaded = true;
        } else {
            comment.style.display = "none";
            component.style.gridColumn = "1/3";
            configButton.replaceChildren("Komplette Config anzeigen");
            configLoaded = false;
        }
    };

    return html`
        <div class="component_site_container_container">

            ${homeButton(instance)}
            ${instance.renderCommentSite(comp)}
            <div class="component_site_container">

                <div class="site_header">
                    <img class="site_icon" src="${data.icon || ''}" alt="icon" />
                    <div class="site_header_text">
                        <h2 class="site_title">${data.title || 'Ohne Titel'}</h2>
                        <div class="site_subject">${data.subject || ''}</div>
                    </div>
                    <div class="site_status ${data.listed ? 'status_listed' : 'status_unlisted'}">
                        ${data.listed ? 'Gelistet' : 'Nicht gelistet'}
                    </div>
                </div>

                <div class="site_section">
                    <h3 class="section_title">Allgemein</h3>
                    <table class="info_table">
                        <tr>
                            <td class="label">Component</td>
                            <td>${data.component || '–'}</td>
                        </tr>
                        <tr>
                            <td class="label">App-ID</td>
                            <td><code>${data.app || '–'}</code></td>
                        </tr>
                        <tr>
                            <td class="label">Key</td>
                            <td><code>${key}</code></td>
                        </tr>
                        <tr>
                            <td class="label">Ersteller</td>
                            <td>${data.creator || '–'}</td>
                        </tr>
                        <tr>
                            <td class="label">Erstellt am</td>
                            <td>${data.created_at || '–'}</td>
                        </tr>
                        <tr>
                            <td class="label">Aktualisiert am</td>
                            <td>${data.updated_at || '–'}</td>
                        </tr>
                        <tr>
                            <td class="label">Gelöscht</td>
                            <td>${data.deleted}</td>
                        </tr>
                        <tr>
                            <td class="label">Tags</td>
                            <td>
                                ${Array.isArray(data.tags) && data.tags.length > 0
                                        ? data.tags.map(t => html`<span class="tag_chip">${t}</span>`)
                                        : html`<span class="empty_value">keine</span>`}
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="site_section">
                    <h3 class="section_title">Beschreibung</h3>
                    <div class="description_box">${data.description || html`<span class="empty_value">keine Beschreibung</span>`}</div>
                </div>

                <div class="site_section">
                    <h3 class="section_title">Zustimmungen (agree)</h3>
                    <table class="info_table">
                        <tr>
                            <td class="label">Content</td>
                            <td>${agree.content}</td>
                        </tr>
                        <tr>
                            <td class="label">Software</td>
                            <td>${agree.software}</td>
                        </tr>
                        <tr>
                            <td class="label">Copyright</td>
                            <td>${agree.copyright}</td>
                        </tr>
                    </table>
                </div>

                <div class="site_section">
                    <h3 class="section_title">Ignore</h3>
                    <table class="info_table">
                        <tr>
                            <td class="label">Config</td>
                            <td>${(ignore.config || []).map((item) => checkArray(item))}
                                <button id="load_config_button" @click=${renderConfig}>
                                    Komplette Config anzeigen
                                </button>
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="site_section">
                    <h3 class="section_title">Metadaten ( _ )</h3>
                    <table class="info_table">
                        <tr>
                            <td class="label">Realm</td>
                            <td>${meta.realm || '–'}</td>
                        </tr>
                        <tr>
                            <td class="label">Creator</td>
                            <td>${meta.creator || '–'}</td>
                        </tr>
                        <tr>
                            <td class="label">Access – get</td>
                            <td>
                                <label class="access_toggle">
                                    <input type="checkbox" class="get_button">
                                    <span class="fake_button" id="get">${meta.access?.get || '–'}</span>

                                    ${dropdownMenu("get")}
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <td class="label">Access – set</td>
                            <td>
                                <label class="access_toggle">
                                    <input type="checkbox" class="set_button">
                                    <span class="fake_button" id="set">
                            ${meta.access?.set || '–'} 
                        </span>

                                    ${dropdownMenu("set")}
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <td class="label">Access – del</td>
                            <td>
                                <label class="access_toggle">
                                    <input type="checkbox" class="del_button">
                                    <span class="fake_button" id="del"> ${meta.access?.del || '–'}   </span>
                                    ${dropdownMenu("del")}
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <td> <button @click=${() => instance.deleteComponent(data)}> delete</button></td>
                            <td> <button @click=${() => instance.updateData(data)}> update </button> </td>
                        </tr>
                    </table>
                </div>

            </div>
        </div>
        <style>

        </style>
    `;
}

/** Rendert nur das Grid der App-Kacheln - ausgelagert, damit Filter/Sortierung nur diesen
 *  Teil neu rendern müssen, statt die komplette Frontpage (Fokus im Input bleibt erhalten). */
function componentGrid(componentArray, instance, hasAnyApp = true) {
    if (!componentArray || componentArray.length === 0) {
        // Zwei verschiedene Ursachen sauber trennen: gar keine eigenen Apps vorhanden
        // oder nur die aktuelle Filterung liefert kein Ergebnis.
        return hasAnyApp
            ? emptyState(
                "Keine Treffer.",
                "Passe die Filter an oder leere die Eingabefelder.",
                "\u{1F50D}")
            : emptyState(
                "Du hast noch keine eigenen Apps.",
                "Sobald du im Digital Makerspace eine App erstellst, erscheint sie hier.",
                "\u{1F4E6}");
    }

    return html`
        ${componentArray.map((comp) => html`
            <div class="component" @click=${() => {
                const idx = resolveDatasetIndex(comp, instance);
                if (idx === -1) {
                    console.warn("[frontpage] Konnte App nicht in datasets finden:", comp?.Titel);
                    return;
                }
                instance.myFunction(idx, comp);
            }}>
                <div class="component_top">
                    <img src=${comp.Icon} class="component_icon">
                    <h5 class="component_name">
                        ${comp.Titel}
                    </h5>
                    <div class="tags">
                        <p class="component_app">App</p>
                        <p class="component_komponente"> ${comp.Komponente} </p>
                    </div>
                </div>

                <div class="component_beschreibung">
                    <p> ${comp.Beschreibung}</p>
                </div>
                <div class="component_bottom"></div>
            </div>
        `)}
    `;
}

export function frontpage(componentArray, instance) {

    // Merkt sich, ob überhaupt Apps geladen wurden – unabhängig von der Filterung.
    const hasAnyApp = Array.isArray(componentArray) && componentArray.length > 0;

    // Filter-/Sortier-Zustand für die Suchleiste
    const state = { titel: "", werkzeug: "", author: "", kategorie: "", sort: "" };

    const applyFilters = (list) => list.filter(comp => {
        const titelOk = !state.titel || (comp.Titel || "").toLowerCase().includes(state.titel.toLowerCase());
        const werkzeugOk = !state.werkzeug || (comp.Komponente || "").toLowerCase().includes(state.werkzeug.toLowerCase());
        // "Ersteller" steht im aktuellen Datenmodell nicht garantiert auf jedem Eintrag - Fallback auf Config.creator.
        const authorSource = comp.Ersteller || comp.Config?.creator || comp.Config?._?.creator || "";
        const authorOk = !state.author || authorSource.toLowerCase().includes(state.author.toLowerCase());
        // "Kategorie" ist aktuell kein Feld im dataArray-Modell - Filter greift nur, falls vorhanden.
        const kategorieOk = !state.kategorie || (comp.Kategorie || "").toLowerCase().includes(state.kategorie.toLowerCase());
        return titelOk && werkzeugOk && authorOk && kategorieOk;
    });

    const applySort = (list) => {
        const sorted = [...list];
        if (state.sort === "alphabetisch") {
            sorted.sort((a, b) => (a.Titel || "").localeCompare(b.Titel || ""));
        } else if (state.sort === "neuste") {
            // created_at ist aktuell nicht Teil des dataArray-Modells - fehlt es, bleibt die
            // Reihenfolge unverändert (kein Crash, nur kein sichtbarer Effekt).
            sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }
        return sorted;
    };

    const rerenderGrid = () => {
        const gridContainer = instance.element?.querySelector(".datacockpit_component_container");
        if (!gridContainer) return;
        render(componentGrid(applySort(applyFilters(componentArray)), instance, hasAnyApp), gridContainer);
    };

    const handleInput = (e) => {
        state[e.target.id] = e.target.value;
        rerenderGrid();
    };

    const handleSort = (e) => {
        state.sort = e.target.value;
        rerenderGrid();
    };

    return html`
        <div class="datacockpit_frontpage_container">
            ${homeButton(instance)}
            <div class="datacockpit_headline_container">
                ${pageHeader(
                        "Data-Cockpit",
                        "Verwende von anderen erstellte Apps als Vorlage für eigene Apps und passe sie dann an deine eigenen individuellen Bedürfnisse an."
                )}
                <div class="datacockpit_frontpage_ladeandere">
                    <p class="ladeandere_hint">Auf der Suche nach Daten, die nicht zu deinen Apps gehören (zum Beispiel Likes, die vergeben wurden)? Klicke einfach den passenden Button an!</p>
                    <div class="ladeandere_buttons">
                        <button @click=${instance.renderPapierkorb}>🗑 Dein Papierkorb</button>
                        <button @click=${instance.renderAppLikesSite}>👍 Likes auf App</button>
                        <button @click=${instance.renderCommentRatingsSite}>💬 Likes auf Kommentare</button>
                        <button @click=${instance.renderComments}>✍️ Kommentare, die du verfasst hast</button>
                        <button @click=${instance.renderCommentComponentCommentRatingsSite}>🧩 Likes auf Kommentare von Kommentarkomponenten</button>
                        <button @click=${instance.renderCommentComponentComments}>🗨️ Deine Kommentare unter Kommentarkomponenten</button>
                    </div>
                </div>
            </div>
            <div class="filter-bar">
                <div class="filter-group">
                    <label for="titel">Titel</label>
                    <input type="text" id="titel" class="eingabe" @input=${handleInput} />
                </div>

                <div class="filter-group">
                    <label for="werkzeug">Werkzeug</label>
                    <input type="text" id="werkzeug" class="eingabe" @input=${handleInput} />
                </div>

                <div class="filter-group">
                    <label for="author">Author</label>
                    <input type="text" id="author" class="eingabe" @input=${handleInput} />
                </div>

                <div class="filter-group">
                    <label for="kategorie">Kategorie</label>
                    <input type="text" id="kategorie" class="eingabe" @input=${handleInput} />
                </div>

                <div class="filter-group">
                    <label for="sortieren">Sortieren nach</label>
                    <select id="sortieren" @change=${handleSort}>
                        <option value="" disabled selected hidden></option>
                        <option value="alphabetisch">Alphabetisch</option>
                        <option value="neuste">neuste zuerst</option>
                    </select>
                </div>
            </div>
            <div class="datacockpit_component_container">
                ${componentGrid(componentArray, instance, hasAnyApp)}
            </div>
        </div>
    `;
}

export function commentSite(data, instance) {

    const config = data.Config || {};
    const meta = config._ || {};
    const controls = config.controls || {};
    const commentEntries = Array.isArray(data.data) ? data.data : [];
    const kommentareStatus = data.Kommentare;
    const configKey = Array.isArray(config.key) ? config.key.join(' / ') : (config.key || '–');

    // Eigene Kommentare erkennen: nur der Ersteller darf löschen (Server-Rechte: "del": "creator").
    // Ohne diese Prüfung würde ein Löschversuch bei fremden Kommentaren serverseitig mit 403
    // abgelehnt, was aktuell zu einem ungewollten Logout führt - daher den Button erst gar nicht anzeigen.
    const currentUserKey = instance.user?.getValue?.()?.key;
    const isOwnComment = (c) => {
        const creator = c?._?.creator ?? c?.creator;
        return !creator || !currentUserKey || creator === currentUserKey;
    };

    const boolBadge = (val) => html`
        <span class="badge ${val ? 'badge_true' : 'badge_false'}">
      ${val ? '✓ ja' : '✗ nein'}
    </span>
    `;

    const controlLabels = {
        answer: 'Antworten',
        delete: 'Löschen',
        dislike: 'Dislike',
        edit: 'Bearbeiten',
        heart: 'Heart'
    };

    const renderControls = () => {
        const keys = Object.keys(controls);

        if (keys.length === 0) return html`<div class="empty_value">keine</div>`;
        return html`
            <div class="badge_group">
                ${keys.map(k => html`
                    <span class="control_badge ${controls[k] ? 'control_on' : 'control_off'}">
            ${controlLabels[k] || k}: ${controls[k] ? '✓' : '✗'}
          </span>
                `)}
            </div>
        `;
    };

    const renderResourceBlock = (label, value) => {
        if (value === undefined || value === null) {
            return html`
                <div class="resource_block">
                    <div class="resource_label">${label}</div>
                    <div class="empty_value">–</div>
                </div>
            `;
        }
        return html`
            <div class="resource_block">
                <div class="resource_label">${label}</div>
                <pre class="json_block">${JSON.stringify(value, null, 2)}</pre>
            </div>
        `;
    };

    const renderCommentEntries = () => {
        if (commentEntries.length === 0) {
            return emptyState(
                "Noch keine Kommentar-Einträge vorhanden.",
                "Zu dieser App wurde bisher nichts kommentiert.",
                "\u{1F4AC}");
        }
        return html`
            <div class="comment_grid">
                ${commentEntries.map((c, index) => html`
                    <div class="comment_card" id="comment-${index}">
                        <div class="comment_card_header">
                            <img class="comment_avatar" src="${c.picture || ''}" alt="avatar" />
                            <div class="comment_meta">
                                <div class="comment_user">${c.user || 'Unbekannt'}</div>
                                <div class="comment_date">${c.created_at || ''}</div>
                            </div>
                            ${isOwnComment(c) ? html`
                                <button class="delete_btn" @click=${() => { //Kommentar löschen und ohne render-Update erstmal verschwinden lassen
                                    instance.deleteComment("dms2-comment-data", c);
                                    const card = instance.element?.querySelector(`#comment-${index}`);
                                    if (card) card.style.display = "none";
                                }}>
                                    🗑
                                </button>
                            ` : ""}
                        </div>
                        <div class="comment_text">${c.text || ''}</div>
                        <div class="comment_footer">
                            <code class="comment_key">${Array.isArray(c.key) ? c.key.join(' / ') : ''}</code>
                        </div>
                    </div>
                `)}
            </div>
        `;
    };

    const renderKommentareStatus = () => {
        const kommentareList = Array.isArray(kommentareStatus) ? kommentareStatus : [];
        if (kommentareList.length === 0) {
            return emptyState(
                "Noch keine Kommentare vorhanden.",
                "",
                "\u{1F4AC}");
        }
        return html`
            <div class="comment_grid">
                ${kommentareList.map((c, index) => html`
                    <div class="comment_card" id="realcomment-${index}">
                        <div class="comment_card_header">
                            <img class="comment_avatar" src="${c.picture || ''}" alt="avatar" />
                            <div class="comment_meta">
                                <div class="comment_user">${c.user || 'Unbekannt'}</div>
                                <div class="comment_date">${c.created_at || ''}</div>
                            </div>
                            ${isOwnComment(c) ? html`
                                <button class="delete_btn" @click=${() => {
                                    instance.deleteComment("dms2-comments", c);
                                    const card = instance.element?.querySelector(`#realcomment-${index}`);
                                    if (card) card.style.display = "none";
                                }}>
                                    🗑
                                </button>
                            ` : ""}
                        </div>
                        <div class="comment_text">${c.text || ''}</div>
                        <div class="comment_footer">
                            <code class="comment_key">${Array.isArray(c.key) ? c.key.join(' / ') : ''}</code>
                        </div>
                    </div>
                `)}
            </div>
        `;
    };

    const renderJSON = (value, depth = 0) => {

        if (value === null || value === undefined) {
            return html`<span class="empty_value">–</span>`;
        }
        if (typeof value === 'boolean') {
            return boolBadge(value);
        }
        if (typeof value !== 'object') {
            return html`<span>${value}</span>`;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) return html`<span class="empty_value">[ ]</span>`;
            return html`
                <div class="rj_array">
                    ${value.map((item, i) => html`
                        <div class="rj_array_item">
                            <span class="rj_index">[${i}]</span>
                            <div class="rj_array_value">${renderJSON(item, depth + 1)}</div>
                        </div>
                    `)}
                </div>
            `;
        }
        const keys = Object.keys(value);
        if (keys.length === 0) return html`<span class="empty_value">{ }</span>`;
        return html`
            <table class="info_table ${depth > 0 ? 'rj_nested' : ''}">
                ${keys.map(k => html`
                    <tr>
                        <td class="label">${k}</td>
                        <td>${renderJSON(value[k], depth + 1)}</td>
                    </tr>
                `)}
            </table>
        `;
    };

    const renderComments = () => html`
        <div class="site_section">
            <h3 class="section_title">Kommentar-Einträge (data)</h3>
            ${renderCommentEntries()}
        </div>
    `;

    return html`
        <div class="comment_site_container">

            <div class="site_header">
                <img class="site_icon" src="${data.Icon || ''}" alt="icon" />
                <div class="site_header_text">
                    <h2 class="site_title">${data.Titel || 'Ohne Titel'}</h2>
                    <div class="site_subject">${data.Komponente || ''}</div>
                </div>
                <div class="site_status status_neutral">
                    ${commentEntries.length} Eintrag${commentEntries.length === 1 ? '' : 'e'}
                </div>
            </div>

            <div class="site_section">
                <h3 class="section_title">Beschreibung</h3>
                <div class="description_box">${data.Beschreibung || html`<span class="empty_value">keine Beschreibung</span>`}</div>
            </div>

            <div class="site_section">
                <h3 class="section_title">Config – Allgemein</h3>
                <table class="info_table">
                    <tr>
                        <td class="label">App-ID</td>
                        <td><code>${config.app || '–'}</code></td>
                    </tr>
                    <tr>
                        <td class="label">Key</td>
                        <td><code>${configKey}</code></td>
                    </tr>
                    <tr>
                        <td class="label">Component</td>
                        <td>${config.component || '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Erstellt am</td>
                        <td>${config.created_at || '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Aktualisiert am</td>
                        <td>${config.updated_at || '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Dark Mode</td>
                        <td>${boolBadge(!!config.dark)}</td>
                    </tr>
                    <tr>
                        <td class="label">Sortierung</td>
                        <td>${boolBadge(!!config.sort)}</td>
                    </tr>
                    <tr>
                        <td class="label">Picture</td>
                        <td>${config.picture
                                ? html`<a href="${config.picture}" target="_blank" rel="noopener">${config.picture}</a>`
                                : html`<span class="empty_value">–</span>`}</td>
                    </tr>
                </table>
            </div>

            <div class="site_section">
                <h3 class="section_title">Controls</h3>
                ${renderControls()}
            </div>

            <div class="site_section">
                <h3 class="section_title">Daten-Quelle</h3>
                <table class="info_table">
                    <tr>
                        <td class="label">Store</td>
                        <td>${config.data && Array.isArray(config.data.store) ? JSON.stringify(config.data.store) : '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Key</td>
                        <td><code>${(config.data && config.data.key) || '–'}</code></td>
                    </tr>
                </table>
            </div>

            <div class="site_section">
                <h3 class="section_title">Ignore</h3>
                <table class="info_table">
                    <tr>
                        <td class="label">Meta</td>
                        <td>${config.ignore && Array.isArray(config.ignore.meta)
                                ? html`<pre class="json_block">${JSON.stringify(config.ignore.meta, null, 2)}</pre>`
                                : html`<span class="empty_value">–</span>`}</td>
                    </tr>
                </table>
            </div>

            <div class="site_section">
                <h3 class="section_title">Ressourcen (Framework-Referenzen)</h3>
                <div class="resource_grid">
                    ${renderResourceBlock('css', config.css)}
                    ${renderResourceBlock('helper', config.helper)}
                    ${renderResourceBlock('html', config.html)}
                    ${renderResourceBlock('lang', config.lang)}
                    ${renderResourceBlock('libs', config.libs)}
                    ${renderResourceBlock('text', config.text)}
                    ${renderResourceBlock('user', config.user)}
                </div>
            </div>

            <div class="site_section">
                <h3 class="section_title">Metadaten ( _ )</h3>
                <table class="info_table">
                    <tr>
                        <td class="label">Realm</td>
                        <td>${meta.realm || '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Creator</td>
                        <td>${meta.creator || '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Access – get</td>
                        <td>${(meta.access && meta.access.get) || '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Access – set</td>
                        <td>${(meta.access && meta.access.set) || '–'}</td>
                    </tr>
                    <tr>
                        <td class="label">Access – del</td>
                        <td>${(meta.access && meta.access.del) || '–'}</td>
                    </tr>
                </table>
            </div>
            ${data.Komponente === "comment" ? renderComments() : renderJSON(data.data)}

            <div class="site_section">
                <h3 class="section_title">Kommentare</h3>
                ${renderKommentareStatus()}
            </div>

        </div>

        <style>

        </style>
    `;
}

export function appTile(componentArray, instance, like = false) {
    // Die Liste kann undefined sein, wenn valuableApps den Schlüssel (noch) nicht
    // enthält – z. B. vor dem ersten fetchData() oder nach einem Ladefehler.
    const list = Array.isArray(componentArray) ? componentArray : [];

    if (list.length === 0) {
        return like
            ? emptyState(
                "Du hast noch keine App geliked.",
                "Sobald du im Digital Makerspace eine App bewertest, erscheint sie hier.",
                "\u{1F44D}")
            : emptyState(
                "Keine Apps vorhanden.",
                "",
                "\u{1F4E6}");
    }

    const uniqueComponents = list.filter((comp, index, arr) => //filtern, dass jede App nur einmal geladen wird
        arr.findIndex(c => c.Titel === comp.Titel) === index //erster Index mit passendem Titel = erstes Vorkommen
    );

    return html`
        ${uniqueComponents.map((comp, index) => html`
            <div class="component" id=${like ? `applike-${index}` : ''} @click=${() => {
                const idx = resolveDatasetIndex(comp, instance);
                if (idx === -1) {
                    console.warn("[appTile] Konnte App nicht in datasets finden:", comp?.Titel);
                    return;
                }
                instance.myFunction(idx, comp);
            }}>
                <div class="component_top">
                    <img src=${comp.Icon} class="component_icon">
                    <h5 class="component_name">
                        ${comp.Titel}
                    </h5>
                    <div class="tags">
                        <p class="component_app">App</p>
                        <p class="component_komponente"> ${comp.Komponente} </p>
                    </div>
                </div>

                <div class="component_beschreibung">
                    <p> ${comp.Beschreibung}</p>
                </div>
                <div class="component_bottom">
                    <div class="component_creator">
                        <span class="creator_icon">👤</span>
                        <span class="creator_name">${comp.Ersteller}</span>
                    </div>
                    <div class="app_rating">
                        ${like ? html`<span>deine Bewertung: ${comp.rating} Sterne</span>` : ""}
                        ${like ? html`
                            <button class="delete_btn" title="Aus deinen Likes entfernen" @click=${async (e) => {
                                e.stopPropagation();
                                const card = instance.element?.querySelector(`#applike-${index}`);
                                if (card) card.style.display = "none";
                                const removed = await instance.deleteAppLike(comp.Key);
                                if (!removed && card) card.style.display = ""; // bei Fehler wieder einblenden
                            }}>
                                🗑
                            </button>
                        ` : ""}
                    </div>
                </div>
            </div>
        `)}
    `;
}

export function commentTile(commentEntries, instance, emptyText) {

    // Wie bei appTile: die Liste kann undefined sein, wenn der Schlüssel in
    // valuableApps fehlt. Ohne diesen Schutz wirft flatMap() und die Seite
    // bliebe komplett leer (der Fehler würde nur in safeRender() landen).
    const entries = Array.isArray(commentEntries) ? commentEntries : [];

    // Alle Kommentare aus allen Komponenten holen
    const comments = entries.flatMap(comp =>
        (comp.Kommentar || []).map(comment => ({
            ...comment,
            rating: comp.rating,
            Titel: comp.Titel,
            Icon: comp.Icon,
            Komponente: comp.Komponente,
            Ersteller: comp.Ersteller,
            Beschreibung: comp.Beschreibung,
            store: comp.store
        }))
    );

    if (comments.length === 0) {
        // Der aufrufende Seitenbaustein gibt den passenden Text vor, damit auf jeder
        // Unterseite steht, welche Art von Einträgen dort fehlt.
        return emptyState(
            emptyText?.title ?? "Noch keine Kommentar-Einträge vorhanden.",
            emptyText?.hint ?? "",
            emptyText?.icon ?? "\u{1F4AC}"
        );
    }

    const getPreview = () => instance.element?.querySelector(".app_preview");

    const renderApp = (comp, event) => {
        let preview = getPreview();

        if (!preview) {
            preview = document.createElement("div");
            preview.className = "app_preview";
            instance.element?.appendChild(preview);
        }

        render(appTile([comp], instance), preview);

        preview.style.left = `${event.clientX + 15}px`;
        preview.style.top = `${event.clientY + 15}px`;
    };

    const updateAppPosition = (event) => {
        const preview = getPreview();
        if (!preview) return;
        preview.style.left = `${event.clientX + 15}px`;
        preview.style.top = `${event.clientY + 15}px`;
    };

    const removeAppPreview = () => {
        const preview = getPreview();
        if (preview) preview.remove();
    };

    // Diese Ansicht zeigt v. a. Kommentare ANDERER User (die man bewertet/geliked hat) - Löschen
    // darf serverseitig nur der Ersteller ("del": "creator"), sonst kommt ein 403, der aktuell
    // zum Logout führt. Daher erst gar nicht versuchen, wenn der Kommentar nicht der eigene ist.
    const currentUserKey = instance.user?.getValue?.()?.key;
    const isOwnComment = (c) => {
        const creator = c?._?.creator ?? c?.creator;
        return !creator || !currentUserKey || creator === currentUserKey;
    };

    // Bugfix: Diese Kachel wird von VIER verschiedenen Seiten genutzt (commentRatings,
    // commentComponentRatings, comments, commentComponentComments), deren Einträge aus zwei
    // unterschiedlichen Collections stammen ("dms2-comments" bzw. "dms2-comment-data"). Bisher
    // war hier "dms2-comments" hartcodiert, wodurch der Löschversuch bei Kommentaren aus
    // "dms2-comment-data" (Kommentar-Komponenten) in der falschen Collection landete - der
    // Eintrag verschwand zwar optisch (Karte wurde ausgeblendet), blieb serverseitig aber
    // bestehen. Jetzt wird die Collection aus dem mitgeführten "store"-Verweis abgeleitet
    // (siehe toMetaObject/COMMENTS_STORE_REF/COMMENT_COMPONENT_STORE_REF in ccm_datacockpit.js).
    const resolveCollection = (comment) => {
        const storeName = Array.isArray(comment?.store) ? comment.store[1]?.name : undefined;
        return storeName || "dms2-comments";
    };

    const deleteComment = async (comment, index) => {
        const collection = resolveCollection(comment);
        const success = await instance.deleteComment(collection, comment);
        if (!success) {
            console.warn(`[commentTile] Löschen fehlgeschlagen (collection=${collection}).`);
            return;
        }
        const card = instance.element?.querySelector(`#comment-${index}`);
        if (card) card.style.display = "none";
    }

    return html`
        ${comments.map((c, index) => html`
            <div class="comment_card" id="comment-${index}"
                 @mouseenter=${(e) => renderApp(c, e)}
                 @mousemove=${(e) => updateAppPosition(e)}
                 @mouseleave=${() => removeAppPreview()}
            >
                <div class="comment_card_header">

                    <img class="comment_avatar" src="${c.picture || ''}" alt="avatar" />
                    <div class="comment_meta">
                        <div class="comment_user">${c.user || 'Unbekannt'}</div>
                        <div class="comment_date">${c.created_at || ''}</div>
                    </div>
                    ${isOwnComment(c) ? html`
                        <button class="delete_btn" @click=${() => deleteComment(c, index)}>🗑</button>
                    ` : ""}
                </div>

                <div class="comment_text">${c.text || ''}</div>
                <div class="comment_rating">
                    ${c.rating
                            ? Object.entries(c.rating).map(([key, value]) => html`
                                <div class="rating_entry">
                                    <span class="rating_key">${key}</span>
                                    <span class="badge ${value ? 'badge_true' : 'badge_false'}">
                                ${typeof value === 'boolean' ? (value ? '✓' : '✗') : value}
                            </span>
                                </div>
                            `)
                            : html`<span>Keine Bewertung</span>`}
                </div>
            </div>
        `)}
    `;
}

export function appLikesSite(componentArray, instance) {
    return html`
        <div class="datacockpit_frontpage_container">
            ${homeButton(instance)}
            <div class="datacockpit_headline_container">
                ${pageHeader(
                        "Deine App-Likes",
                        "Alle Apps, die du bewertet hast - unabhängig davon, ob sie dir selbst gehören."
                )}
            </div>

            <div class="datacockpit_component_container">
                ${appTile(componentArray, instance, true)}
            </div>
        </div>
    `;
}

/**
 * Drei fachlich unterschiedliche Seiten teilen sich diese Funktion. "variant"
 * ersetzt das vorherige reine Boolean "commentType": Damit ließen sich nur zwei
 * Fälle unterscheiden, obwohl es drei gibt - die Seite mit den eigenen
 * verfassten Kommentaren (renderComments) bekam dadurch bisher denselben Text
 * wie die Kommentar-Komponenten-Likes-Seite, obwohl beide inhaltlich nichts
 * miteinander zu tun haben. "variant" verwendet bewusst dieselben Schlüssel
 * wie "valuableApps" ("commentRatings" / "commentComponentRatings" / "comments"),
 * damit Aufrufer nicht zwei verschiedene Vokabulare pflegen müssen.
 */
export function commentLikesSite(componentArray, instance, variant) {
    const TEXT = {
        commentRatings: {
            title: "Deine Kommentar-Bewertungen",
            description: "Hier siehst du alle Kommentare, die du bewertet hast! Wenn du wissen willst, zu welcher App sie gehören, hover einfach über die Kachel.",
            empty: {
                title: "Du hast noch keinen Kommentar bewertet.",
                hint: "Bewertete Kommentare anderer Nutzer erscheinen hier.",
                icon: "\u{1F44D}"
            }
        },
        commentComponentRatings: {
            title: "Likes auf Kommentare von Kommentarkomponenten",
            description: "Hier siehst du alle Kommentare, welche zu Kommentar-Apps gehören, die du geliked hast! Wenn du wissen willst, zu welcher Kommentar-App sie gehören, hover einfach über die Kachel.",
            empty: {
                title: "Du hast noch keine Kommentar-Komponente geliked.",
                hint: "Bewertete Kommentare von Kommentar-Apps erscheinen hier.",
                icon: "\u{1F9E9}"
            }
        },
        comments: {
            title: "Deine verfassten Kommentare",
            description: "Hier siehst du alle Kommentare, die du selbst verfasst hast. Wenn du wissen willst, zu welcher App sie gehören, hover einfach über die Kachel.",
            empty: {
                title: "Du hast noch keinen Kommentar verfasst.",
                hint: "Sobald du eine App kommentierst, erscheint dein Kommentar hier.",
                icon: "\u{270D}\u{FE0F}"
            }
        },
        commentComponentComments: {
            title: "Deine verfassten Kommentare unter Kommentarkomponenten",
            description: "Hier siehst du alle Kommentare, die du selbst unter Kommentar-Komponenten verfasst hast. Wenn du wissen willst, zu welcher Kommentar-App sie gehören, hover einfach über die Kachel.",
            empty: {
                title: "Du hast noch keinen Kommentar unter einer Kommentar-Komponente verfasst.",
                hint: "Sobald du eine Kommentar-App kommentierst, erscheint dein Kommentar hier.",
                icon: "\u{1F5E8}\u{FE0F}"
            }
        }
    };
    const text = TEXT[variant] ?? TEXT.comments;

    return html`
        <div class="datacockpit_frontpage_container">
            ${homeButton(instance)}
            <div class="datacockpit_headline_container">
                ${pageHeader(text.title, text.description)}
            </div>

            <div class="datacockpit_component_container">
                ${commentTile(componentArray, instance, text.empty)}
            </div>
        </div>
    `;
}

/** Zeigt alle toten Verweise (Ergebnis von findDeadReferences) und bietet einen Button
 *  zum endgültigen Löschen (ruft instance.emptyTrash() -> emptyTrashBin() auf). */
export function papierkorbSite(deadData, instance) {

    deadData = deadData || new Map();

    const appRatings = deadData.get("appRatings") || [];
    const commentRatings = deadData.get("commentRatings") || [];
    const commentComponentRatings = deadData.get("commentComponentRatings") || [];
    const comments = deadData.get("comments") || [];
    const configs = deadData.get("configs") || [];
    const commentComponentComments = deadData.get("commentComponentComments") || [];

    const total = appRatings.length + commentRatings.length + commentComponentRatings.length +
        comments.length + configs.length + commentComponentComments.length;

    // Baut die Meta-Zeilen (Keys) für einen einzelnen toten Verweis auf
    const entryMeta = (entry) => {
        const items = [];
        if (entry.AppKey !== undefined) {
            items.push(["App-Key", Array.isArray(entry.AppKey) ? entry.AppKey.join(' / ') : entry.AppKey]);
        }
        if (entry.ConfigKey !== undefined) {
            items.push(["Config-Key", Array.isArray(entry.ConfigKey) ? entry.ConfigKey.join(' / ') : entry.ConfigKey]);
        }
        if (entry.RatingKey !== undefined) {
            items.push(["Rating-Key", entry.RatingKey]);
        }
        if (entry.EntrySchluessel !== undefined) {
            items.push(["Eintrag-Key", Array.isArray(entry.EntrySchluessel) ? entry.EntrySchluessel.join(' / ') : entry.EntrySchluessel]);
        }
        return items;
    };

    // Rendert eine Kategorie (z. B. "Configs") als Karten-Grid, mit Grund + Keys pro Eintrag
    const category = (label, categoryKey, entries) => {
        entries = entries || [];

        const handleDeleteEntry = async (entry, e) => {
            if (!confirm("Diesen einzelnen Eintrag endgültig löschen? Das kann nicht rückgängig gemacht werden.")) return;
            const btn = e.target;
            btn.disabled = true;
            btn.textContent = "…";
            const success = await instance.deleteTrashEntry(categoryKey, entry);
            if (!success) {
                btn.disabled = false;
                btn.textContent = "🗑";
            }
        };

        return html`
            <div class="site_section">
                <h3 class="section_title">${label} <span class="trash_count">${entries.length}</span></h3>
                ${entries.length === 0
                        ? html`<div class="empty_value">keine toten Verweise</div>`
                        : html`
                            <div class="trash_grid">
                                ${entries.map(entry => html`
                                    <div class="trash_card">
                                        <div class="trash_card_header">
                                            <div class="trash_reason">${entry.Grund || 'Unbekannter Grund'}</div>
                                            <button class="delete_btn" title="Diesen Eintrag löschen"
                                                    @click=${(e) => handleDeleteEntry(entry, e)}>
                                                🗑
                                            </button>
                                        </div>
                                        <table class="info_table">
                                            ${entryMeta(entry).map(([k, v]) => html`
                                                <tr>
                                                    <td class="label">${k}</td>
                                                    <td><code>${v}</code></td>
                                                </tr>
                                            `)}
                                        </table>
                                    </div>
                                `)}
                            </div>
                        `}
            </div>
        `;
    };

    const handleEmpty = async (e) => {
        if (!confirm(`Wirklich ${total} Einträge endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
        e.target.disabled = true;
        e.target.textContent = "Lösche …";
        await instance.emptyTrash();
    };

    return html`
        <div class="datacockpit_frontpage_container papierkorb_container">
            ${homeButton(instance)}
            <div class="papierkorb_header">
                ${pageHeader(
                        "Papierkorb",
                        "Hier findest du verwaiste Verweise - Bewertungen, Konfigurationen oder Kommentare, deren zugehörige App/Config/Kommentar nicht mehr existiert. Du kannst sie hier endgültig entfernen."
                )}
                <button class="trash_empty_button" @click=${handleEmpty} ?disabled=${total === 0}>
                    🗑 Papierkorb leeren (${total})
                </button>
            </div>

            <div class="component_site_container trash_content">
                ${total === 0
                        ? emptyState(
                                "Dein Papierkorb ist leer.",
                                "Es wurden keine verwaisten Verweise gefunden – alle deine Einträge verweisen auf vorhandene Daten.",
                                "\u{2728}")
                        : html`
                            ${category("App-Bewertungen", "appRatings", appRatings)}
                            ${category("Kommentar-Bewertungen", "commentRatings", commentRatings)}
                            ${category("Kommentar-Komponenten-Bewertungen", "commentComponentRatings", commentComponentRatings)}
                            ${category("Eigene Kommentare", "comments", comments)}
                            ${category("Configs", "configs", configs)}
                            ${category("Kommentar-Komponenten-Kommentare", "commentComponentComments", commentComponentComments)}
                        `}
            </div>
        </div>
    `;
}