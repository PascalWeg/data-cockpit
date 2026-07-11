/**
 * ccm-Komponente "mini_apps"
 *
 * Architektur (siehe vorherige Refaktorierung):
 * 1. Reine Hilfsfunktionen (kein "this", leicht testbar)
 * 2. createDataService(instance)   -> kapselt ALLE Store-Zugriffe (CRUD) inkl. Caching
 * 3. createRenderDataBuilder(...)  -> baut das "dataArray" für die Frontpage
 * 4. createRatingsMapper(...)      -> baut die "valuableApps"-Map
 * 5. createViewController(instance)-> kapselt die Navigation zwischen den Views
 *
 * NEU – Robustheit:
 * - logError() zentralisiert Fehlerausgaben mit Kontext, statt verstreuter console.error/log
 * - Jeder einzelne Store-Zugriff in createDataService ist try/catch-abgesichert und liefert
 *   im Fehlerfall einen sicheren Default ([] / null) statt die Exception weiterzureichen.
 *   Grund: Promise.all() bricht sonst komplett ab, sobald EIN Zugriff fehlschlägt – dann
 *   wäre z. B. die ganze Frontpage leer, nur weil ein externer Store kurz nicht erreichbar war.
 * - deleteApp() nutzt Promise.allSettled statt Promise.all: Wenn ein Store beim Löschen
 *   fehlschlägt, werden die anderen trotzdem gelöscht, und der Fehler wird geloggt statt
 *   den ganzen Löschvorgang abzubrechen.
 * - In den Mapper-Funktionen (mapAppRatings, mapCommentRatings, ...) wird jeder Eintrag
 *   einzeln abgesichert: ein fehlerhafter/fehlender App-Datensatz wirft nicht mehr die
 *   komplette Liste um, sondern wird einfach übersprungen (result.filter(Boolean)).
 * - Öffentliche Methoden (start, fetchData, updateData, deleteComponent, deleteComment)
 *   validieren ihre Eingaben und fangen Fehler ab, statt unbehandelte Promise-Rejections
 *   zu erzeugen.
 * - Integrierte manuelle Anpassungen: fetchAllApps() in der DataService-API, und der
 *   zusätzliche "comment"-Filter auf die pro-App geladenen Kommentare ist jetzt direkt
 *   Teil von fetchCommentsForApp() statt eines separaten forEach-Schritts in fetchData().
 */

// ============================================================
// 0) Zentrales Error-Logging
// ============================================================

function logError(context, err) {
    console.error(`[mini_apps] Fehler in ${context}:`, err);
}

// ============================================================
// 1) Reine Hilfsfunktionen
// ============================================================

/** Teilt Rohdaten aus dem "dms2-apps"-Store in Apps und "Rest" (z. B. das Bewertungs-Dokument) */
function splitAppsFromRest(rawItems) {
    const apps = [];
    const rest = [];
    for (const item of rawItems || []) {
        if (typeof item.app === "undefined") rest.push(item);
        else apps.push(item);
    }
    return { apps, rest };
}

/** Gibt alle Items zurück, die das angegebene Feld besitzen (z. B. "comments" oder "comment") */
function extractByField(items, field) {
    return (items || []).filter(item => item && field in item);
}

/** app-Key -> Config, für schnellen Lookup beim Bauen der Render-Objekte */
function buildConfigMap(configs) {
    return new Map((configs || []).map(cfg => [cfg.app, cfg]));
}

/** Gruppiert Kommentare (pro App abgefragt) nach ihrem App-Key (key[2]) */
function groupCommentsByAppKey(commentGroups) {
    const map = new Map();
    for (const group of commentGroups || []) {
        if (!group || group.length === 0) continue;
        for (const item of group) {
            const key = item?.key?.[2];
            if (key === undefined) continue; // fehlerhafter/unvollständiger Eintrag -> überspringen
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(item);
        }
    }
    return map;
}

/**
 * Baut aus den drei rohen Datenquellen (eigene Apps, alle Kommentare, Kommentar-Komponenten-
 * Einträge) das "restDataset"-Array, das mapRestData/createRatingsMapper erwartet.
 * Reihenfolge ist bewusst fix, weil createRatingsMapper positionsbasiert darauf zugreift:
 *   [0] Bewertungs-Dokument des Users für eigene Apps (oder null)
 *   [1] Bewertungen von Kommentaren ("comments" in item)
 *   [2] Bewertungen von Kommentar-Komponenten-Einträgen (oder null)
 *   [3] tatsächliche eigene Kommentare ("comment" in item)
 */
function buildRestDataset(ownItems, allComments, commentComponentEntries) {
    const { apps, rest } = splitAppsFromRest(ownItems);
    const appRatingsDoc = rest.length > 0 ? rest[0] : null;

    const commentRatings = extractByField(allComments, "comments");
    const ownComments = extractByField(allComments, "comment");
    const commentComponentRatings = extractByField(commentComponentEntries, "comments");

    return {
        apps,
        restDataset: [
            appRatingsDoc,
            commentRatings,
            commentComponentRatings.length > 0 ? commentComponentRatings : null,
            ownComments
        ]
    };
}

// ============================================================
// 2) Datenzugriffs-Schicht
// ============================================================

function createDataService(instance) {
    const storeCache = new Map(); // vermeidet mehrfaches Neu-Erzeugen derselben ccm.store-Instanz

    async function getStore(storeConfig) {
        const cacheKey = JSON.stringify(storeConfig);
        if (!storeCache.has(cacheKey)) {
            try {
                storeCache.set(cacheKey, await instance.ccm.store(storeConfig));
            } catch (err) {
                logError(`getStore(${cacheKey})`, err);
                storeCache.delete(cacheKey);
                throw err; // hier bewusst weiterreichen, da fetchExternalAppData selbst absichert
            }
        }
        return storeCache.get(cacheKey);
    }

    return {
        // --- Lesen (alle mit sicherem Default im Fehlerfall) ---
        fetchUserApps: async (userKey) => {
            try {
                return await instance.store.get({ "_.creator": userKey });
            } catch (err) {
                logError("fetchUserApps", err);
                return [];
            }
        },
        fetchUserConfigs: async (userKey) => {
            try {
                return await instance.configs.get({ "_.creator": userKey });
            } catch (err) {
                logError("fetchUserConfigs", err);
                return [];
            }
        },
        fetchUserCommentComponentEntries: async (userKey) => {
            try {
                return await instance.comment.get({ "_.creator": userKey });
            } catch (err) {
                logError("fetchUserCommentComponentEntries", err);
                return [];
            }
        },
        fetchUserAllComments: async (userKey) => {
            try {
                return await instance.data.get({ "_.creator": userKey });
            } catch (err) {
                logError("fetchUserAllComments", err);
                return [];
            }
        },
        /** Kommentare zu einer App, direkt auf echte Kommentare gefiltert (ohne Bewertungs-Einträge) */
        fetchCommentsForApp: async (appKey) => {
            try {
                const entries = await instance.data.get({ "app.2": appKey });
                return extractByField(entries, "comment");
            } catch (err) {
                logError(`fetchCommentsForApp(${appKey})`, err);
                return [];
            }
        },
        fetchAllApps: async () => {
            try {
                return await instance.store.get();
            } catch (err) {
                logError("fetchAllApps", err);
                return [];
            }
        },

        fetchAppByKey: async (key) => {
            try {
                return await instance.store.get(key);
            } catch (err) {
                logError(`fetchAppByKey(${JSON.stringify(key)})`, err);
                return null;
            }
        },
        fetchCommentByKey: async (key) => {
            try {
                return await instance.data.get(key);
            } catch (err) {
                logError(`fetchCommentByKey(${JSON.stringify(key)})`, err);
                return null;
            }
        },
        fetchCommentComponentEntryByKey: async (query) => {
            try {
                return await instance.comment.get(query);
            } catch (err) {
                logError(`fetchCommentComponentEntryByKey(${JSON.stringify(query)})`, err);
                return [];
            }
        },
        fetchConfigByDataKey: async (appKey) => {
            try {
                const result = await instance.configs.get({ "data.key": appKey });
                return result?.[0] ?? null;
            } catch (err) {
                logError(`fetchConfigByDataKey(${appKey})`, err);
                return null;
            }
        },

        /** Lädt die "externen" Daten einer App (abhängig von deren individueller Store-Config) */
        fetchExternalAppData: async (config) => {
            if (!(config?.data?.store?.length >= 1)) return null;

            try {
                const store = await getStore(config.data.store[1]);
                let data = await store.get({ app: config.data.key });

                if (Array.isArray(data) && data.length > 0) {
                    data = extractByField(data, "comment");
                } else {
                    data = await instance.polls.get(config.data.key);
                }

                return data ?? null;
            } catch (err) {
                logError(`fetchExternalAppData(app=${config?.data?.key})`, err);
                return null; // App wird trotzdem angezeigt, nur ohne externe Daten
            }
        },

        // --- Schreiben ---
        saveApp: async (dataset) => {
            try {
                await instance.store.set(dataset);
                return true;
            } catch (err) {
                logError("saveApp", err);
                return false;
            }
        },

        /** Löscht eine App aus allen zugehörigen Stores. Ein einzelner Fehlschlag stoppt nicht die anderen. */
        deleteApp: async (key) => {
            const stores = [
                ["store", instance.store],
                ["configs", instance.configs],
                ["data", instance.data],
                ["comment", instance.comment]
            ];

            const results = await Promise.allSettled(stores.map(([, store]) => store.del(key)));

            let allSucceeded = true;
            results.forEach((result, idx) => {
                if (result.status === "rejected") {
                    allSucceeded = false;
                    logError(`deleteApp (Store "${stores[idx][0]}")`, result.reason);
                }
            });
            return allSucceeded;
        },

        deleteCommentComponentEntry: async (key) => {
            try {
                await instance.comment.del(key);
                return true;
            } catch (err) {
                logError(`deleteCommentComponentEntry(${JSON.stringify(key)})`, err);
                return false;
            }
        },
        deleteCommentEntry: async (key) => {
            try {
                await instance.data.del(key);
                return true;
            } catch (err) {
                logError(`deleteCommentEntry(${JSON.stringify(key)})`, err);
                return false;
            }
        }
    };
}

// ============================================================
// 3) Aufbau des dataArray für die Frontpage
// ============================================================

function createRenderDataBuilder(dataService) {
    function buildEntry(configMap, commentMap) {
        return async (item) => {
            const config = configMap.get(item.app);

            const entry = {
                Titel: item.title,
                Beschreibung: item.subject,
                Icon: item.icon,
                Komponente: item.component,
                Config: config,
                Kommentare: commentMap.get(item.app) || null
            };

            const externalData = await dataService.fetchExternalAppData(config);
            if (externalData) entry.data = externalData;

            return entry;
        };
    }

    return {
        async build(apps, configMap, commentMap) {
            // fetchExternalAppData fängt seine Fehler bereits selbst ab, daher reicht hier
            // ein normales Promise.all - ein einzelner Ausfall reißt die anderen nicht mit.
            return Promise.all((apps || []).map(buildEntry(configMap, commentMap)));
        }
    };
}

// ============================================================
// 4) Aufbau der "valuableApps"-Map (Bewertungen & fremde Kommentare)
// ============================================================

function createRatingsMapper(dataService) {
    const APP_STORE_REF = ["ccm.store", { name: "dms2-apps", url: "https://ccm2.inf.h-brs.de" }];
    const COMMENTS_STORE_REF = ["ccm.store", { name: "dms2-comments", url: "https://ccm2.inf.h-brs.de" }];
    const COMMENT_COMPONENT_STORE_REF = ["ccm.store", { name: "dms2-comment-data", url: "https://ccm2.inf.h-brs.de" }];

    /** Gemeinsames Grundgerüst für alle vier Bewertungs-/Kommentar-Typen */
    function toMetaObject(source, extra = {}) {
        return {
            Titel: source.title,
            Beschreibung: source.subject,
            Icon: source.icon,
            Komponente: source.component,
            Ersteller: source.creator,
            ...extra
        };
    }

    // 1) Bewertungen der eigenen Apps
    async function mapAppRatings(appRatingsDoc) {
        if (!appRatingsDoc?.ratings) return [];

        const results = await Promise.all(
            Object.keys(appRatingsDoc.ratings).map(async (key) => {
                try {
                    const appKey = key.split(",");
                    const app = await dataService.fetchAppByKey(appKey);
                    if (!app) return null; // App wurde evtl. gelöscht -> Eintrag überspringen

                    return toMetaObject(app, {
                        rating: appRatingsDoc.ratings[key],
                        Key: appKey,
                        store: APP_STORE_REF
                    });
                } catch (err) {
                    logError(`mapAppRatings(key=${key})`, err);
                    return null;
                }
            })
        );

        return results.filter(Boolean);
    }

    // 2) Bewertungen von Kommentaren (dms2-comments)
    async function mapCommentRatings(entries) {
        if (!entries) return [];

        const results = await Promise.all(
            entries.map(async (entry) => {
                try {
                    if (!entry?.comments) return null;

                    const ratingKey = Object.keys(entry.comments)[0]; // Format: "x,appKey,dataKey"
                    const [, appKey, dataKey] = ratingKey.split(",");
                    const app = await dataService.fetchAppByKey([appKey, dataKey]);
                    if (!app) return null;

                    const obj = toMetaObject(app, {
                        rating: entry.comments[ratingKey],
                        Kommentar: [],
                        store: COMMENTS_STORE_REF
                    });

                    for (const key of Object.keys(entry.comments)) {
                        const comment = await dataService.fetchCommentByKey(key.split(","));
                        if (comment) obj.Kommentar.push(comment);
                    }
                    return obj;
                } catch (err) {
                    logError("mapCommentRatings(entry)", err);
                    return null;
                }
            })
        );

        return results.filter(Boolean);
    }

    // 3) Bewertungen von Kommentar-Komponenten-Einträgen (dms2-comment-data)
    async function mapCommentComponentRatings(entries) {
        if (!entries) return [];

        const results = await Promise.all(
            entries.map(async (entry) => {
                try {
                    if (!entry?.comments) return null;

                    const ratingKey = Object.keys(entry.comments)[0];
                    const config = await dataService.fetchConfigByDataKey(entry.app);
                    if (!config?.key) return null;

                    const app = await dataService.fetchAppByKey(config.key);
                    if (!app) return null;

                    const obj = toMetaObject(app, {
                        rating: entry.comments[ratingKey],
                        Kommentar: [],
                        store: COMMENT_COMPONENT_STORE_REF
                    });

                    for (const key of Object.keys(entry.comments)) {
                        const [, commentKey] = key.split(",");
                        const matches = await dataService.fetchCommentComponentEntryByKey({ comment: commentKey });
                        if (matches?.[0]) obj.Kommentar.push(matches[0]);
                    }
                    return obj;
                } catch (err) {
                    logError("mapCommentComponentRatings(entry)", err);
                    return null;
                }
            })
        );

        return results.filter(Boolean);
    }

    // 4) Eigene, tatsächlich verfasste Kommentare
    async function mapOwnComments(entries) {
        if (!entries) return [];

        const results = await Promise.all(
            entries.map(async (entry) => {
                try {
                    if (entry.deleted) return null;
                    if (!entry?.key?.[1] || !entry?.key?.[2]) return null;

                    const appKey = [entry.key[1], entry.key[2]];
                    const app = await dataService.fetchAppByKey(appKey);
                    if (!app) return null;

                    return toMetaObject(app, {
                        rating: "",
                        Kommentar: [entry],
                        store: COMMENTS_STORE_REF,
                        Key: entry.key
                    });
                } catch (err) {
                    logError("mapOwnComments(entry)", err);
                    return null;
                }
            })
        );

        return results.filter(Boolean);
    }

    return {
        /** @param restDataset [appRatingsDoc, commentRatings, commentComponentRatings, ownComments] */
        async build(restDataset) {
            const [appRatingsDoc, commentRatings, commentComponentRatings, ownComments] = restDataset || [];

            const [appRatingsResult, commentRatingsResult, commentComponentRatingsResult, commentsResult] =
                await Promise.all([
                    mapAppRatings(appRatingsDoc),
                    mapCommentRatings(commentRatings),
                    mapCommentComponentRatings(commentComponentRatings),
                    mapOwnComments(ownComments)
                ]);

            return new Map([
                ["appRatings", appRatingsResult],
                ["commentRatings", commentRatingsResult],
                ["commentComponentRatings", commentComponentRatingsResult],
                ["comments", commentsResult]
            ]);
        }
    };
}

// ============================================================
// 5) View-Navigation
// ============================================================

function createViewController(instance) {
    function safeRender(buildFn, context) {
        try {
            const vnode = buildFn();
            instance.html.render(vnode, instance.element);
        } catch (err) {
            logError(`View: ${context}`, err);
        }
    }

    return {
        renderFrontpage: () =>
            safeRender(() => instance.html.frontpage(instance.dataArray, instance), "renderFrontpage"),

        renderComponentSite: (appIndex, comp) =>
            safeRender(() => instance.html.componentSite(instance.datasets[appIndex], comp, instance), "renderComponentSite"),

        renderCommentSite: (comp) => {
            try {
                return instance.html.commentSite(comp, instance);
            } catch (err) {
                logError("renderCommentSite", err);
                return null;
            }
        },

        renderRestSite: () =>
            safeRender(() => instance.html.restSite(instance.valuableApps, instance), "renderRestSite"),

        renderAppLikesSite: () =>
            safeRender(() => instance.html.appLikesSite(instance.valuableApps.get("appRatings"), instance), "renderAppLikesSite"),

        renderCommentRatingsSite: () =>
            safeRender(() => instance.html.commentLikesSite(instance.valuableApps.get("commentRatings"), instance, true), "renderCommentRatingsSite"),

        renderCommentComponentCommentRatingsSite: () =>
            safeRender(() => instance.html.commentLikesSite(instance.valuableApps.get("commentComponentRatings"), instance, false), "renderCommentComponentCommentRatingsSite"),

        renderComments: () =>
            safeRender(() => instance.html.commentLikesSite(instance.valuableApps.get("comments"), instance, false), "renderComments")
    };
}

// ============================================================
// ccm-Komponente
// ============================================================

ccm.component({

    name: "mini_apps",

    ccm: "https://ccmjs.github.io/ccm/ccm.js",

    config: {

        html: ["ccm.load", { url: "./resources/templates.js", type: "module" }],

        user: ["ccm.start", "https://ccmjs.github.io/akless-components/user/ccm.user.js", {
            url: "https://ccm2.inf.h-brs.de",
            realm: "cloud",
            store: "dms-user",
            title: "Please enter Username and Password",
            hash: ["ccm.load", { "url": "https://ccmjs.github.io/akless-components/modules/md5.mjs", "type": "module" }]
        }],

        store: ["ccm.store", {
            name: "dms2-apps",
            url: "https://ccm2.inf.h-brs.de"
        }],
        configs: ["ccm.store", {
            name: "dms2-configs",
            url: "https://ccm2.inf.h-brs.de"
        }],
        comment: ["ccm.store", {
            name: "dms2-comment-data",
            url: "https://ccm2.inf.h-brs.de"
        }],
        polls: ["ccm.store", {
            name: "live_poll_data",
            url: "wss://ccm2.inf.h-brs.de"
        }],
        data: ["ccm.store", {
            url: "https://ccm2.inf.h-brs.de",
            name: "dms2-comments"
        }],

        css: ["ccm.load",
            [
                [
                    "https://ccmjs.github.io/digital-makerspace/libs/bootstrap-5/css/bootstrap.min.css",
                    "https://ccmjs.github.io/digital-makerspace/resources/styles.min.css"
                ],
                "https://ccmjs.github.io/digital-makerspace/libs/bootstrap-5/css/bootstrap-icons.min.css",
                {
                    "url": "https://ccmjs.github.io/digital-makerspace/libs/bootstrap-5/css/bootstrap-fonts.min.css",
                    "context": "head"
                },
                "./resources/style.css"
            ]
        ]
    },

    Instance: function () {

        this.dataArray = [];     // fertige Render-Objekte für die Frontpage
        this.datasets = [];      // eigene Apps (roh, ohne Bewertungen/Rest)
        this.valuableApps = new Map();

        let dataService, renderDataBuilder, ratingsMapper, view;

        // wird vom ccm-Framework automatisch vor start() aufgerufen
        this.init = async () => {
            dataService = createDataService(this);
            renderDataBuilder = createRenderDataBuilder(dataService);
            ratingsMapper = createRatingsMapper(dataService);
            view = createViewController(this);
        };

        this.start = async () => {
            try {
                if (!this.user?.isLoggedIn?.()) {
                    view_renderLogin();
                    return;
                }

                document.body.style.margin = "0";
                document.body.style.padding = "0";

                await this.fetchData();
                view.renderFrontpage();
            } catch (err) {
                logError("start", err);
                renderFallbackError();
            }
        };

        // Login-Screen separat, damit start() im try/catch bleibt und Fehler dort sauber landen
        const view_renderLogin = async () => {
            try {
                this.html.render(this.html.mainLogin(), this.element);
                const userSlot = this.element.querySelector("#user");
                if (userSlot) await userSlot.appendChild(this.user.root);
            } catch (err) {
                logError("renderLogin", err);
                renderFallbackError();
            }
        };

        const renderFallbackError = () => {
            // Minimaler Fallback, falls selbst das Rendering fehlschlägt - lieber eine
            // verständliche Meldung als eine leere weiße Seite.
            if (this.element) {
                this.element.innerHTML = "<p>Es ist ein Fehler beim Laden der Daten aufgetreten. Bitte Seite neu laden.</p>";
            }
        };

        this.fetchData = async () => {
            const userKey = this.user?.getValue?.()?.key;
            if (!userKey) {
                logError("fetchData", new Error("Kein eingeloggter User gefunden."));
                this.datasets = [];
                this.dataArray = [];
                this.valuableApps = new Map();
                return;
            }

            const [ownItems, configs, commentComponentEntries, allComments] = await Promise.all([
                dataService.fetchUserApps(userKey),
                dataService.fetchUserConfigs(userKey),
                dataService.fetchUserCommentComponentEntries(userKey),
                dataService.fetchUserAllComments(userKey)
            ]);

            const { apps, restDataset } = buildRestDataset(ownItems, allComments, commentComponentEntries);
            this.datasets = apps;

            const configMap = buildConfigMap(configs);
            const commentGroups = await Promise.all(apps.map(app => dataService.fetchCommentsForApp(app.app)));
            const commentMap = groupCommentsByAppKey(commentGroups);

            this.dataArray = await renderDataBuilder.build(apps, configMap, commentMap);
            this.valuableApps = await ratingsMapper.build(restDataset);
        };

        this.myFunction = async (index, comp) => {
            if (!this.datasets?.[index]) {
                logError("myFunction", new Error(`Kein Dataset an Index ${index} gefunden.`));
                return;
            }
            view.renderComponentSite(index, comp);
        };

        this.updateData = async (currentDataSet) => {
            if (!currentDataSet) {
                logError("updateData", new Error("currentDataSet ist leer."));
                return false;
            }
            return dataService.saveApp(currentDataSet);
        };

        this.deleteComponent = async (component) => {
            if (!component?.key) {
                logError("deleteComponent", new Error("component.key fehlt."));
                return false;
            }

            const success = await dataService.deleteApp(component.key);
            await this.fetchData();
            view.renderFrontpage();
            return success;
        };

        this.deleteComment = async (collection, comment) => {
            if (!comment) {
                logError("deleteComment", new Error("comment fehlt."));
                return false;
            }

            if (collection === "dms2-comment-data") {
                return dataService.deleteCommentComponentEntry(comment);
            }
            if (collection === "dms2-comments") {
                return dataService.deleteCommentEntry(comment);
            }

            logError("deleteComment", new Error(`Unbekannte Collection "${collection}".`));
            return false;
        };

        // --- Seiten-Navigation (öffentliche API, von templates.js genutzt) ---
        this.renderCommentSite = (comp) => view.renderCommentSite(comp);
        this.renderRestSite = () => view.renderRestSite();
        this.renderAppLikesSite = () => view.renderAppLikesSite();
        this.renderCommentRatingsSite = () => view.renderCommentRatingsSite();
        this.renderCommentComponentCommentRatingsSite = () => view.renderCommentComponentCommentRatingsSite();
        this.renderComments = () => view.renderComments();
    }

});