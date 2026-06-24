import { html, render } from './../libs/lit/lit.js';
export { render };




export function detail(app) {
        return html`
            <div>
                <h2>${app.title}</h2>
                <p>${app.description || ""}</p>

                <button onclick="location.reload()">
                    zurück
                </button>
            </div>
        `}
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


export function componentSite(data, instance) {
    data = data || {};

    const agree = data.agree || {};
    const ignore = data.ignore || {};
    const meta = data._ || {};
    const key = Array.isArray(data.key) ? data.key.join(' / ') : (data.key || '–');
    console.log(data)



    const renderIgnoreConfig = (config) => {
        if (!Array.isArray(config) || config.length === 0) {
            return `<div class="empty_value">–</div>`;
        }
        return html `
      <ul class="sublist">
        ${config.map(item => `<li>${typeof item === 'object' ? JSON.stringify(item) : item}</li>`).join('')}
      </ul>
    `;
    };

    //rekursive Funktion um Arrays und Obejkte die in der JSON der Komponente liegen iterativ auszugeben und auf den Bildschirm zu Projezieren
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

        //Wenn das Item ein Array ist wird jedes Item aus dem Array zurückgegeben nachdem es darauf rekursiv geprüft wurde ob es selber wieder ein Array ist
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
        return html `
            <div class="dropdown_container">
                <button @click=${() => alterRights(type, "creator")}> creator </button> <br>
                <button @click=${() => alterRights(type, "all")}> all </button> <br>
               
            </div>
            
        `
    }

    const alterRights = (type, right) => {
        data._.access[type] = right; // das richtige Schlüssel wert paar erneuern
        instance.element.querySelector(`#${type}`).innerHTML = right;
    }

    return html`
        <div class="component_site_container_container">
            
        
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
            <td>${data.deleted }</td>
          </tr>
          <tr>
            <td class="label">Tags</td>
            <td>
              ${Array.isArray(data.tags) && data.tags.length > 0
        ? data.tags.map(t => `<span class="tag_chip">${t}</span>`).join(' ')
        : '<span class="empty_value">keine</span>'}
            </td>
          </tr>
        </table>
      </div>

      <div class="site_section">
        <h3 class="section_title">Beschreibung</h3>
        <div class="description_box">${data.description || '<span class="empty_value">keine Beschreibung</span>'}</div>
      </div>

      <div class="site_section">
        <h3 class="section_title">Zustimmungen (agree)</h3>
        <table class="info_table">
          <tr>
            <td class="label">Content</td>
            <td>${data.agree.content }</td>
          </tr>
          <tr>
            <td class="label">Software</td>
            <td>${data.agree.software }</td>
          </tr>
          <tr>
            <td class="label">Copyright</td>
            <td>${data.agree.copyright}</td>
          </tr>
        </table>
      </div>

      <div class="site_section">
        <h3 class="section_title">Ignore</h3>
        <table class="info_table">
          <tr>
            <td class="label">Config</td>
            <td>${data.ignore.config.map((item) => {
                
                return checkArray(item);
    })}</td>
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
                            ${(meta.access && meta.access.set) || '–'} 
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
                    <span class="fake_button" id="del"> ${(meta.access && meta.access.del) || '–'}   </span>
                    ${dropdownMenu("del")}
                </label>
            </td>
          </tr>
            <tr>
                <td> <button @click = ${() => instance.deleteComponent(data)}> delete</button></td>
                <td> <button @click = ${() => instance.updateData(data)}> update </button> </td>
            </tr>
        </table>
      </div>

    </div>
        </div>
    <style>
      
    </style>
  `;
}
export function frontpage(componentArray, instance){

    /* Wähle alle eingaben, gebe jeder eingabe einen Eventlistener dass bei Input die suchbarfunktion aufgerufen wird mit der ID als topic*/
    const filter = (topic, input) => {
        console.log(topic, input);
        let tempData = [];
        componentArray.forEach((item)=>{
            console.log(item)
        })
    };

    const handleInput = (e) => {
        filter(e.target.id, e.target.value);
    };
    return html`
        <div class="datacockpit_frontpage_container">
            <div class="datacockpit_headline_container">
                <div class="datacockpit_frontpage_headline">
                    <h2 class="datacockpit_landingpage_head">Data-Cockpit</h2>
                    <p class="datacockpit_landingpage_description">Verwende von anderen erstellte Apps als Vorlage für eigene Apps und passe sie dann an deine eigenen individuellen Bedürfnisse an.</p>
                    <img src="https://ccmjs.github.io/akless-components/cloze/resources/icon.svg" class ="datacockpit_frontpage_video">
                </div>
               

                </img>
                
            </div>
            <div class="filter-bar">
                <div class="filter-group">
                    <label for="titel">Titel</label>
                    <input type="text" id="titel" class="eingabe" @input=${handleInput} />
                </div>

                <div class="filter-group">
                    <label for="werkzeug">Werkzeug</label>
                    <input type="text" id="werkzeug" class="eingabe" @input=${handleInput}}/>
                </div>

                <div class="filter-group">
                    <label for="author">Author</label>
                    <input type="text" id="author" class="eingabe" @input=${handleInput}}/>
                </div>

                <div class="filter-group">
                    <label for="kategorie">Kategorie</label>
                    <input type="text" id="kategorie" class="eingabe" @input=${handleInput}}/>
                </div>
                    
                       
                    
                <div class="filter-group">
                    <label for="sortieren">Sortieren nach</label>
                    <select id="sortieren">
                        <option value="" disabled selected hidden></option>
                        <option value="alphabetisch">Alphabetisch</option>
                        <option value="neuste">neuste zuerst</option>
                    </select>
                </div>
            </div>
            <div class="datacockpit_component_container">
                
                ${componentArray.map((comp, index) => 
                    html`
                        <div class="component" @click=${() => instance.myFunction(index)}>
                            <div class="component_top">
                                <img src=${comp.Icon} class="component_icon">
                                <h5 class="component_name">
                                    ${comp.Titel}
                                </h5>
                                <div class="tags" >
                                    <p class ="component_app">App</p>
                                    <p class="component_komponente"> ${comp.Komponente} </p>
                                    
                                    
                                </div>
                            </div>
                            
                            <div class="component_beschreibung">
                                <p> ${comp.Beschreibung}</p>
                            </div>
                            <div class="component_bottom">
                                
                                
                            </div>`
                    
                )}
                
            </div>
            
        </div>
    `

    //Funktion um die Suchleiste zu benutzen. Topic beschreibt hier was gesucht wird (Titel Werkzeug etc)

}
