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

/**
 * Prüft, ob ein Eintrag dem eingeloggten User gehört (creator-Feld) - konsistent mit der
 * gleichen Rechte-Prüfung in appCascadeDeleter.splitByOwnership() und commentSite/commentTile
 * isOwnComment(). Fehlt der Creator (Altdaten), wird der Eintrag als "eigen" behandelt.
 */
function isOwnEntry(entry, userKey) {
    const creator = entry?._?.creator ?? entry?.creator;
    return !creator || !userKey || creator === userKey;
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
    const commentComponentComments = extractByField(commentComponentEntries, "comment")

    return {
        apps,
        restDataset: [
            appRatingsDoc,
            commentRatings,
            commentComponentRatings.length > 0 ? commentComponentRatings : null,
            ownComments,
            commentComponentComments
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
        fetchConfigsForApp: async (appKey) => {
            try {
                return await instance.configs.get({ app: appKey });
            } catch (err) {
                logError(`fetchConfigsForApp(${JSON.stringify(appKey)})`, err);
                return [];
            }
        },
        fetchCommentComponentEntriesForApp: async (dataKey) => {
            try {
                return await instance.comment.get({ app: dataKey });
            } catch (err) {
                logError(`fetchCommentComponentEntriesForApp(${JSON.stringify(dataKey)})`, err);
                return [];
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
        fetchAllConfigs: async () => {
            try {
                const result = await instance.configs.get();
                return result ?? null;
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
        deleteAppRecord: async (appKey) => {
            try {
                await instance.store.del(appKey);
                return true;
            } catch (err) {
                logError(`deleteAppRecord(${JSON.stringify(appKey)})`, err);
                return false;
            }
        },
        deleteConfigEntry: async (key) => {
            try {
                await instance.configs.del(key);
                return true;
            } catch (err) {
                logError(`deleteConfigEntry(${JSON.stringify(key)})`, err);
                return false;
            }
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
                        console.log("comment")
                        console.log(comment)
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

    // 3b) Kommentare, die ANDERE Nutzer zu den eigenen Kommentar-Komponenten verfasst haben
    //     (analog zu mapCommentComponentRatings, aber für den "comment"- statt "comments"-Zweig)
    async function mapCommentComponentComments(entries) {
        if (!entries) return [];

        const results = await Promise.all(
            entries.map(async (entry) => {
                try {
                    if (!entry?.comment) return null;

                    const config = await dataService.fetchConfigByDataKey(entry.app);
                    if (!config?.key) return null;

                    const app = await dataService.fetchAppByKey(config.key);
                    if (!app) return null;

                    return toMetaObject(app, {
                        rating: "",
                        Kommentar: [entry],
                        store: COMMENT_COMPONENT_STORE_REF,
                        Key: entry.key
                    });
                } catch (err) {
                    logError("mapCommentComponentComments(entry)", err);
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
        /** @param restDataset [appRatingsDoc, commentRatings, commentComponentRatings, ownComments, commentComponentComments] */
        async build(restDataset) {
            const [appRatingsDoc, commentRatings, commentComponentRatings, ownComments, commentComponentComments] = restDataset || [];

            const [appRatingsResult, commentRatingsResult, commentComponentRatingsResult, commentsResult, commentComponentCommentsResult] =
                await Promise.all([
                    mapAppRatings(appRatingsDoc),
                    mapCommentRatings(commentRatings),
                    mapCommentComponentRatings(commentComponentRatings),
                    mapOwnComments(ownComments),
                    mapCommentComponentComments(commentComponentComments)
                ]);

            return new Map([
                ["appRatings", appRatingsResult],
                ["commentRatings", commentRatingsResult],
                ["commentComponentRatings", commentComponentRatingsResult],
                ["comments", commentsResult],
                ["commentComponentComments", commentComponentCommentsResult]
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
            safeRender(() => instance.html.commentLikesSite(instance.valuableApps.get("commentRatings"), instance, "commentRatings"), "renderCommentRatingsSite"),

        renderCommentComponentCommentRatingsSite: () =>
            safeRender(() => instance.html.commentLikesSite(instance.valuableApps.get("commentComponentRatings"), instance, "commentComponentRatings"), "renderCommentComponentCommentRatingsSite"),

        renderComments: () =>
            safeRender(() => instance.html.commentLikesSite(instance.valuableApps.get("comments"), instance, "comments"), "renderComments"),

        renderCommentComponentComments: () =>
            safeRender(() => instance.html.commentLikesSite(instance.valuableApps.get("commentComponentComments"), instance, "commentComponentComments"), "renderCommentComponentComments"),

        renderPapierkorbSite: () =>
            safeRender(() => instance.html.papierkorbSite(instance.deadData, instance), "renderPapierkorbSite"),
    };



}



// ============================================================
// 6) Garbage Collector – findet verwaiste ("tote") Verweise
// ============================================================
// Prinzip: pro Kollektion, in der der User Owner ist, wird jeder Eintrag
// darauf geprüft, ob sein/e Eltern-Datensatz/-sätze noch existieren.
// Fehlt der Parent (z. B. App gelöscht, Kommentar gelöscht), ist der
// Eintrag ein "toter Verweis" und wird gesammelt statt sofort gelöscht -
// löschen ist ein bewusster zweiter Schritt (siehe Hinweis unten).

function createGarbageCollector(dataService) {

    async function appExists(appKey) {
        return !!(await dataService.fetchAppByKey(appKey));
    }
    async function browseAllConfigs(configs,key){

        for(config of configs){
            if(config.data.key == key) return true;



        }
        return false;

    }

    // 1) Bewertungen der eigenen Apps -> tot, wenn die bewertete App fehlt
    async function findDeadAppRatings(appRatingsDoc) {
        if (!appRatingsDoc?.ratings) return [];

        const results = await Promise.all(
            Object.keys(appRatingsDoc.ratings).map(async (key) => {
                try {
                    const appKey = key.split(",");
                    if (await appExists(appKey)) return null;

                    return {
                        Grund: "App existiert nicht mehr",
                        RatingKey: key,
                        AppKey: appKey
                    };
                } catch (err) {
                    logError(`findDeadAppRatings(key=${key})`, err);
                    return null;
                }
            })
        );

        return results.filter(Boolean);
    }

    // 2) Bewertungen von Kommentaren -> tot, wenn Kommentar ODER App fehlt
    async function findDeadCommentRatings(entries) {
        console.log("entries")
        console.log(entries)
        if (!entries) return [];

        const results = [];
        for (const entry of entries) {
            if (!entry?.comments) continue;

            for (const ratingKey of Object.keys(entry.comments)) {
                try {
                    const [, appKey, dataKey] = ratingKey.split(",");
                    const [comment, app] = await Promise.all([
                        dataService.fetchCommentByKey(ratingKey.split(",")),
                        dataService.fetchAppByKey([appKey, dataKey])
                    ]);
                    console.log(comment)
                    if(comment) {
                        if(comment.deleted){
                            dataService.deleteApp("comment",ratingKey.split(","))
                        }
                    }

                    console.log("data")
                    console.log(comment)

                    if (comment && app) continue;

                    results.push({
                        Grund: !comment ? "Kommentar existiert nicht mehr" : "App existiert nicht mehr",
                        RatingKey: ratingKey,
                        EntrySchluessel: entry.key
                    });
                } catch (err) {
                    logError(`findDeadCommentRatings(ratingKey=${ratingKey})`, err);
                }
            }
        }
        return results;
    }

    // 3) Bewertungen von Kommentar-Komponenten-Einträgen
    async function findDeadCommentComponentRatings(entries) {
        if (!entries) return [];

        const results = [];
        for (const entry of entries) {
            if (!entry?.comments) continue;

            try {
                const config = await dataService.fetchConfigByDataKey(entry.app);
                const app = config?.key ? await dataService.fetchAppByKey(config.key) : null;

                if (!config || !app) {
                    results.push({
                        Grund: !config ? "Config existiert nicht mehr" : "App existiert nicht mehr",
                        EntrySchluessel: entry.key
                    });
                    continue; // ohne Config/App lassen sich die einzelnen Kommentare nicht sinnvoll prüfen
                }

                for (const ratingKey of Object.keys(entry.comments)) {
                    const [, commentKey] = ratingKey.split(",");
                    const matches = await dataService.fetchCommentComponentEntryByKey({ comment: commentKey });
                    if (matches?.[0]) continue;

                    results.push({
                        Grund: "Kommentar-Komponenten-Eintrag existiert nicht mehr",
                        RatingKey: ratingKey,
                        EntrySchluessel: entry.key
                    });
                }
            } catch (err) {
                logError(`findDeadCommentComponentRatings(entry=${JSON.stringify(entry.key)})`, err);
            }
        }
        return results;
    }

    // 4) Eigene, tatsächlich verfasste Kommentare -> tot, wenn die App fehlt
    async function findDeadOwnComments(entries) {
        if (!entries) return [];

        const results = await Promise.all(
            entries.map(async (entry) => {
                try {
                    if (entry.deleted) return null;
                    if (!entry?.key?.[1] || !entry?.key?.[2]) return null;

                    const appKey = [entry.key[1], entry.key[2]];
                    if (await appExists(appKey)) return null;

                    return {
                        Grund: "App existiert nicht mehr",
                        EntrySchluessel: entry.key
                    };
                } catch (err) {
                    logError(`findDeadOwnComments(entry=${JSON.stringify(entry?.key)})`, err);
                    return null;
                }
            })
        );

        return results.filter(Boolean); //Null filtern
    }

    // 5) Eigene Configs -> tot, wenn die zugehörige App fehlt
    async function findDeadConfigs(configs) {
        if (!configs) return [];

        const results = await Promise.all(
            configs.map(async (cfg) => {
                try {
                    if (await appExists(cfg.key)) return null;

                    return {
                        Grund: "App existiert nicht mehr",
                        ConfigKey: cfg.key,
                        AppKey: cfg.app
                    };
                } catch (err) {
                    logError(`findDeadConfigs(cfg=${JSON.stringify(cfg?.key)})`, err);
                    return null;
                }
            })
        );

        return results.filter(Boolean);//Null filtern
    }

    async function findDeadCommentComponentComments(comments){

        if(!comments)return [];

        let configs = await dataService.fetchAllConfigs();
        configs = configs.filter(c => c.data && c.data !== "")


        const results = await Promise.all(
            comments.map(async (cmnt) => {
                try {
                    if (await browseAllConfigs(configs, cmnt.key[0])) return null;

                    return {
                        Grund: "App existiert nicht mehr",
                        EntrySchluessel: cmnt.key,
                        AppKey: cmnt.app
                    };
                } catch (err) {
                    logError(`findDeadConfigs(cfg=${JSON.stringify(cmnt?.key)})`, err);
                    return null;
                }
            })
        )
        return results.filter(Boolean);//Null filtern
    }

    return {
        /**
         * Sammelt alle toten Verweise über alle Kollektionen des eingeloggten Users.
         * @returns {Promise<Map<string, object[]>>}
         */
        async run(userKey) {
            const [ownItems, configs, commentComponentEntries, allComments] = await Promise.all([
                dataService.fetchUserApps(userKey),
                dataService.fetchUserConfigs(userKey),
                dataService.fetchUserCommentComponentEntries(userKey),
                dataService.fetchUserAllComments(userKey)
            ]);

            // Zusätzliche Absicherung wie in appCascadeDeleter/deleteComment: auch wenn die
            // Server-Query oben schon nach "_.creator" filtern sollte, werden fremde Einträge
            // hier nochmal explizit ausgeschlossen, bevor sie im Papierkorb landen können.
            const ownCommentComponentEntries = commentComponentEntries.filter(e => isOwnEntry(e, userKey));
            const ownAllComments = allComments.filter(e => isOwnEntry(e, userKey));

            const { restDataset } = buildRestDataset(ownItems, ownAllComments, ownCommentComponentEntries);
            const [appRatingsDoc, commentRatings, commentComponentRatings, ownComments, commentComponentComments] = restDataset;

            const [deadAppRatings, deadCommentRatings, deadCommentComponentRatings, deadOwnComments, deadConfigs,deadCommentComponentComments] =
                await Promise.all([
                    findDeadAppRatings(appRatingsDoc),
                    findDeadCommentRatings(commentRatings),
                    findDeadCommentComponentRatings(commentComponentRatings),
                    findDeadOwnComments(ownComments),
                    findDeadConfigs(configs),
                    findDeadCommentComponentComments(commentComponentComments)
                ]);

            return new Map([
                ["appRatings", deadAppRatings],
                ["commentRatings", deadCommentRatings],
                ["commentComponentRatings", deadCommentComponentRatings],
                ["comments", deadOwnComments],
                ["configs", deadConfigs],
                ["commentComponentComments",deadCommentComponentComments]

            ]);
        }
    };
}

// ============================================================
// 7) Vollständiges Löschen aller Daten eines Users
// ============================================================
// Iteriert über alle Stores, in denen der User Owner sein kann
// (store, configs, comment, data) und löscht dort JEDEN Datensatz,
// dessen "_.creator" dem übergebenen userKey entspricht - ausschließlich
// über dessen "key" (nie per Query direkt im del()-Aufruf), damit klar
// nachvollziehbar ist, was genau gelöscht wurde.

function createUserDataEraser(instance) {

    // Name dient nur fürs Logging/Reporting, nicht für die Store-Ansteuerung selbst.
    function getManagedStores() {
        return [
            ["apps (dms2-apps)", instance.store],
            ["configs (dms2-configs)", instance.configs],
            ["comment-component (dms2-comment-data)", instance.comment],
            ["comments (dms2-comments)", instance.data]
        ];
    }

    /** Löscht in EINEM Store alle Datensätze eines Users, Key für Key. */
    async function eraseStore(storeName, store, userKey) {
        let entries;
        try {
            entries = await store.get({ "_.creator": userKey });
        } catch (err) {
            logError(`eraseStore(${storeName}) - get`, err);
            return { store: storeName, deleted: [], failed: [], readError: true };
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            return { store: storeName, deleted: [], failed: [], readError: false };
        }

        const results = await Promise.allSettled(
            entries.map(entry => store.del(entry.key))
        );

        const deleted = [];
        const failed = [];
        results.forEach((result, idx) => {
            const key = entries[idx].key;
            if (result.status === "fulfilled") {
                deleted.push(key);
            } else {
                failed.push(key);
                logError(`eraseStore(${storeName}) - del(${JSON.stringify(key)})`, result.reason);
            }
        });

        return { store: storeName, deleted, failed, readError: false };
    }

    return {
        /**
         * Löscht ALLE Datensätze eines Users über alle verwalteten Stores hinweg.
         * @returns {Promise<Map<string, {store:string, deleted:any[], failed:any[], readError:boolean}>>}
         */
        async eraseAll(userKey) {
            if (!userKey) {
                logError("eraseAll", new Error("Kein userKey übergeben."));
                return new Map();
            }

            const stores = getManagedStores();
            const results = await Promise.all(
                stores.map(([name, store]) => eraseStore(name, store, userKey))
            );

            return new Map(results.map(r => [r.store, r]));
        }
    };
}

// ============================================================
// 8) Kaskadierendes Löschen einer App
// ============================================================
// Löscht beim Löschen einer App NICHT ganze Kollektionen, sondern
// gezielt genau die Einträge, die über Keys/Referenzen an diese App
// gebunden sind:
//   - store            : die App selbst (per appKey)
//   - configs           : alle Configs mit configs.app === appKey
//   - data (Kommentare) : alle Kommentare mit app.2 === appKey
//   - comment (Komponenten-Einträge): alle Einträge mit
//                         comment.app === config.data.key,
//                         für jede zur App gehörende Config
//
// Jeder gefundene Eintrag wird über seinen EIGENEN key gelöscht, nie
// über den appKey selbst - das war der Bug in der alten deleteApp().
//
// Rechte-Check: access.del ist bei configs/comment/data jeweils "creator".
// Unter der eigenen App können aber Kommentare bzw. Kommentar-Komponenten-
// Einträge ANDERER User hängen (z.B. wenn jemand die App kommentiert hat).
// Die gehören uns nicht, dürfen also auch beim App-Löschen nicht mitgelöscht
// werden - der Server würde das ohnehin mit 403 ablehnen (siehe deleteComment).
// Deshalb wird hier VOR dem Löschen nach "_.creator === userKey" gefiltert;
// fremde Einträge werden übersprungen statt einen 403 zu provozieren.

function createAppCascadeDeleter(dataService) {

    async function deleteByKeys(deleteFn, entries, storeLabel) {
        if (!entries || entries.length === 0) return { deleted: [], failed: [] };

        const results = await Promise.allSettled(entries.map(e => deleteFn(e.key)));

        const deleted = [];
        const failed = [];
        results.forEach((result, idx) => {
            const key = entries[idx].key;
            if (result.status === "fulfilled" && result.value !== false) {
                deleted.push(key);
            } else {
                failed.push(key);
                if (result.status === "rejected") {
                    logError(`cascadeDelete(${storeLabel}) - del(${JSON.stringify(key)})`, result.reason);
                }
            }
        });
        return { deleted, failed };
    }

    /**
     * Trennt Einträge danach, ob der eingeloggte User ihr "_.creator" ist.
     * Nur eigene Einträge dürfen gelöscht werden (access.del === "creator");
     * fremde Einträge landen in "foreign" und werden NICHT angefasst.
     */
    function splitByOwnership(entries, userKey) {
        const owned = [];
        const foreign = [];
        for (const entry of entries || []) {
            const creator = entry?._?.creator ?? entry?.creator;
            if (!creator || !userKey || creator === userKey) {
                owned.push(entry);
            } else {
                foreign.push(entry);
            }
        }
        return { owned, foreign };
    }

    return {
        /**
         * Löscht eine App und alle daran gebundenen Einträge in configs, data und comment,
         * für die der eingeloggte User Löschrecht hat (Ersteller). Einträge anderer User
         * (z.B. fremde Kommentare unter der eigenen App) werden übersprungen und als
         * "skipped" gemeldet statt gelöscht zu werden.
         * @param {*} recordKey  der Store-Key des App-Records (für store.del/fetchAppByKey)
         * @param {*} appLinkKey der Wert von item.app - das Feld, über das configs/comments/data
         *                       auf die App verweisen (NICHT identisch mit recordKey!)
         * @param {*} userKey    Key des eingeloggten Users - entscheidet, was kaskadierend
         *                       tatsächlich gelöscht werden darf.
         * @returns {Promise<Map<string, {deleted:any[], failed:any[], skipped?:any[]}>>}
         */
        async eraseApp(recordKey, appLinkKey, userKey) {
            if (!recordKey || appLinkKey === undefined) {
                logError("eraseApp", new Error("recordKey oder appLinkKey fehlt."));
                return new Map();
            }

            // 1) Configs der App über das Link-Feld ermitteln
            const allConfigs = await dataService.fetchConfigsForApp(appLinkKey);

            // 2) Comment-Komponenten-Einträge: pro Config alle Einträge mit app === config.data.key
            //    (über ALLE Configs, nicht nur die eigenen - unter fremden Configs an dieser
            //    App können ebenfalls Kommentar-Komponenten-Einträge hängen)
            const commentComponentGroups = await Promise.all(
                allConfigs
                    .filter(cfg => cfg?.data?.key)
                    .map(cfg => dataService.fetchCommentComponentEntriesForApp(cfg.data.key))
            );
            const allCommentComponentEntries = commentComponentGroups.flat();

            // 3) Kommentare (dms2-comments) der App - ebenfalls über das Link-Feld
            const allComments = await dataService.fetchCommentsForApp(appLinkKey);

            // 4) Nach Löschrecht trennen - nur eigene Einträge werden gelöscht
            const { owned: configs, foreign: foreignConfigs } = splitByOwnership(allConfigs, userKey);
            const { owned: comments, foreign: foreignComments } = splitByOwnership(allComments, userKey);
            const { owned: commentComponentEntries, foreign: foreignCommentComponentEntries } =
                splitByOwnership(allCommentComponentEntries, userKey);

            if (foreignConfigs.length || foreignComments.length || foreignCommentComponentEntries.length) {
                logError(
                    "eraseApp",
                    new Error(
                        `Kein Löschrecht für ${foreignConfigs.length} Config(s), ${foreignComments.length} ` +
                        `Kommentar(e) und ${foreignCommentComponentEntries.length} Kommentar-Komponenten-Eintrag/-Einträge ` +
                        `- gehören nicht "${userKey}" und werden übersprungen.`
                    )
                );
            }

            // 5) Alles parallel löschen, wofür Löschrecht besteht
            const [appResult, configsResult, commentsResult, commentComponentResult] = await Promise.all([
                (async () => {
                    const success = await dataService.deleteAppRecord(recordKey);
                    return success
                        ? { deleted: [recordKey], failed: [] }
                        : { deleted: [], failed: [recordKey] };
                })(),
                deleteByKeys(dataService.deleteConfigEntry, configs, "configs"),
                deleteByKeys(dataService.deleteCommentEntry, comments, "data"),
                deleteByKeys(dataService.deleteCommentComponentEntry, commentComponentEntries, "comment")
            ]);

            return new Map([
                ["app", appResult],
                ["configs", { ...configsResult, skipped: foreignConfigs.map(e => e.key) }],
                ["comments", { ...commentsResult, skipped: foreignComments.map(e => e.key) }],
                ["commentComponentEntries", { ...commentComponentResult, skipped: foreignCommentComponentEntries.map(e => e.key) }]
            ]);
        }
    };
}
// Löscht GENAU EINEN toten Verweis (eine Kategorie + ein Eintrag daraus).
// Wird sowohl von emptyTrashBin (alle Einträge) als auch vom gezielten Einzel-Löschen genutzt.
async function deleteTrashEntry(category, entry, dataService, userKey) {
    switch (category) {
        case "comments":
        case "commentRatings":
            // beides landet in der gleichen Kollektion (dms2-comments)
            return dataService.deleteCommentEntry(entry.EntrySchluessel);

        case "commentComponentRatings":
        case "commentComponentComments":
            return dataService.deleteCommentComponentEntry(entry.EntrySchluessel);

        case "configs":
            return dataService.deleteConfigEntry(entry.ConfigKey);

        case "appRatings": {
            // appRatings sind kein eigenständiger Datensatz, sondern ein Feld im
            // appRatingsDoc.ratings-Objekt - deshalb Patch statt del().
            let ratings = await dataService.fetchAppByKey(`_${userKey}`);
            if (!ratings?.ratings || !(entry.RatingKey in ratings.ratings)) return false;

            ratings = refactorAppRating(ratings, entry.RatingKey);

            if (Object.keys(ratings.ratings).length === 0) {
                await dataService.deleteAppRecord(ratings.key);
            } else {
                await dataService.saveApp(ratings);
            }
            return true;
        }

        default:
            logError("deleteTrashEntry", new Error(`Unbekannte Kategorie "${category}".`));
            return false;
    }
}

//Alles was so in der Trash bin drinne ist kann hier geleert werden
async function emptyTrashBin(collection, dataService, userKey) {
    const categories = [
        ["comments", collection.get("comments") || []],
        ["commentRatings", collection.get("commentRatings") || []],
        ["commentComponentRatings", collection.get("commentComponentRatings") || []],
        ["configs", collection.get("configs") || []],
        ["commentComponentComments", collection.get("commentComponentComments") || []],
        ["appRatings", collection.get("appRatings") || []]
    ];

    for (const [category, entries] of categories) {
        for (const entry of entries) {
            try {
                await deleteTrashEntry(category, entry, dataService, userKey);
            } catch (err) {
                logError(`emptyTrashBin(${category})`, err);
            }
        }
    }
}

function refactorAppRating(collection, key){
    delete collection.ratings[key];
    return collection;


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

        let dataService, renderDataBuilder, ratingsMapper, view, garbageCollector, userDataEraser, appCascadeDeleter;

        // wird vom ccm-Framework automatisch vor start() aufgerufen
        this.init = async () => {
            dataService = createDataService(this);
            renderDataBuilder = createRenderDataBuilder(dataService);
            ratingsMapper = createRatingsMapper(dataService);
            view = createViewController(this);
            garbageCollector = createGarbageCollector(dataService);
            userDataEraser = createUserDataEraser(this);
            appCascadeDeleter = createAppCascadeDeleter(dataService);

            // Bisher musste die Seite nach dem Login einmal manuell neu geladen werden, damit
            // statt des Login-Screens die eigentliche Cockpit-Ansicht erscheint: this.user.login()
            // rendert nach erfolgreichem Login zwar seinen EIGENEN Login/Logout-Button neu, aber
            // nicht unseren App-Inhalt (der noch den Login-Screen zeigt). Der ccm.user-Baustein
            // bietet dafür extra einen "onchange"-Callback, der nach jedem Login/Logout mit dem
            // neuen Login-Status aufgerufen wird - hier hängen wir uns ein und rendern bei
            // erfolgreichem Login automatisch neu, ohne dass ein manueller Reload nötig ist.
            if (this.user) {
                if (!Array.isArray(this.user.onchange)) {
                    this.user.onchange = this.user.onchange ? [this.user.onchange] : [];
                }
                this.user.onchange.push(async (loggedIn) => {
                    if (loggedIn) await this.start();
                });
            }
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
            console.log("deadData")
            const deadData = await this.findDeadReferences()
            console.log(deadData)
            //this.deleteGarbage(deadData, dataService)
            //this.deleteAllUserData();






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

            console.log(ownItems)
            console.log(configs)
            console.log(commentComponentEntries)
            console.log(allComments)


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
            if (!component?.key || component?.app === undefined) {
                logError("deleteComponent", new Error("component.key oder component.app fehlt."));
                return false;
            }

            const userKey = this.user?.getValue?.()?.key;
            const report = await appCascadeDeleter.eraseApp(component.key, component.app, userKey);
            await this.fetchData();
            view.renderFrontpage();

            return report.get("app")?.deleted.length > 0;
        };

        // Nimmt entweder den kompletten Kommentar-Datensatz (bevorzugt, da so das Ersteller-Recht
        // geprüft werden kann) ODER - abwärtskompatibel - nur den reinen Key entgegen.
        this.deleteComment = async (collection, comment) => {
            if (!comment) {
                logError("deleteComment", new Error("comment fehlt."));
                return false;
            }

            // Rechte-Check VOR dem Store-Zugriff: Der Server lehnt das Löschen fremder
            // Kommentare sowieso mit 403 ab - dieser 403 führt aktuell aber zu einem
            // ungewollten Logout. Deshalb erst gar nicht versuchen, wenn wir anhand des
            // "_.creator"-Felds erkennen, dass der Kommentar nicht dem eingeloggten User gehört.
            const isFullEntry = comment && typeof comment === "object" && !Array.isArray(comment) && "key" in comment;
            const key = isFullEntry ? comment.key : comment;

            if (isFullEntry) {
                const creator = comment._?.creator ?? comment.creator;
                const userKey = this.user?.getValue?.()?.key;
                if (creator && userKey && creator !== userKey) {
                    logError(
                        "deleteComment",
                        new Error(`Kein Löschrecht: Kommentar "${JSON.stringify(key)}" gehört "${creator}", eingeloggt als "${userKey}".`)
                    );
                    return false;
                }
            }

            if (collection === "dms2-comment-data") {
                return dataService.deleteCommentComponentEntry(key);
            }
            if (collection === "dms2-comments") {
                return dataService.deleteCommentEntry(key);
            }

            logError("deleteComment", new Error(`Unbekannte Collection "${collection}".`));
            return false;
        };

        // Entfernt den Like/die Bewertung des aktuellen Users für eine App (appKey: Array oder String)
        this.deleteAppLike = async (appKey) => {
            const userKey = this.user?.getValue?.()?.key;
            if (!userKey) {
                logError("deleteAppLike", new Error("Kein eingeloggter User gefunden."));
                return false;
            }
            if (!appKey) {
                logError("deleteAppLike", new Error("appKey fehlt."));
                return false;
            }

            const ratingKey = Array.isArray(appKey) ? appKey.join(",") : appKey;

            try {
                let ratings = await dataService.fetchAppByKey(`_${userKey}`);
                if (!ratings?.ratings || !(ratingKey in ratings.ratings)) return false;

                ratings = refactorAppRating(ratings, ratingKey);

                if (Object.keys(ratings.ratings).length === 0) {
                    await dataService.deleteAppRecord(ratings.key);
                } else {
                    await dataService.saveApp(ratings);
                }
                return true;
            } catch (err) {
                logError(`deleteAppLike(key=${ratingKey})`, err);
                return false;
            }
        };

        // --- Seiten-Navigation (öffentliche API, von templates.js genutzt) ---
        this.renderCommentSite = (comp) => view.renderCommentSite(comp);
        this.renderRestSite = () => view.renderRestSite();
        this.renderAppLikesSite = () => view.renderAppLikesSite();
        this.renderCommentRatingsSite = () => view.renderCommentRatingsSite();
        this.renderCommentComponentCommentRatingsSite = () => view.renderCommentComponentCommentRatingsSite();
        this.renderComments = () => view.renderComments();
        this.renderCommentComponentComments = () => view.renderCommentComponentComments();

        this.findDeadReferences = async () => {
            const userKey = this.user?.getValue?.()?.key;
            if (!userKey) {
                logError("findDeadReferences", new Error("Kein eingeloggter User gefunden."));
                return new Map();
            }
            return garbageCollector.run(userKey);
        };
        this.deleteAllUserData = async () => {
            const userKey = this.user?.getValue?.()?.key;
            if (!userKey) {
                logError("deleteAllUserData", new Error("Kein eingeloggter User gefunden."));
                return new Map();
            }
            const report = await userDataEraser.eraseAll(userKey);
            await this.fetchData();
            view.renderFrontpage();
            return report;
        };
        this.renderPapierkorb = async () => {
            this.deadData = await this.findDeadReferences();
            view.renderPapierkorbSite();
        };

        this.emptyTrash = async () => {
            if (!this.deadData) this.deadData = await this.findDeadReferences();
            await emptyTrashBin(this.deadData, dataService, this.user?.getValue?.()?.key );
            // Nach dem Löschen neu berechnen (sollte jetzt größtenteils leer sein) und Ansicht aktualisieren
            this.deadData = await this.findDeadReferences();
            view.renderPapierkorbSite();
        };

        // Löscht gezielt EINEN Eintrag aus dem Papierkorb (category z.B. "comments", "appRatings", ...)
        this.deleteTrashEntry = async (category, entry) => {
            const userKey = this.user?.getValue?.()?.key;
            if (!userKey) {
                logError("deleteTrashEntry", new Error("Kein eingeloggter User gefunden."));
                return false;
            }
            if (!category || !entry) {
                logError("deleteTrashEntry", new Error("category oder entry fehlt."));
                return false;
            }

            let success = false;
            try {
                success = await deleteTrashEntry(category, entry, dataService, userKey);
            } catch (err) {
                logError(`deleteTrashEntry(${category})`, err);
                return false;
            }

            // lokale Kopie aktualisieren, damit die Ansicht sofort passt, ohne alles neu zu laden
            if (success && this.deadData?.get(category)) {
                this.deadData.set(category, this.deadData.get(category).filter(e => e !== entry));
            }
            view.renderPapierkorbSite();
            return success;
        };
        this.deleteGarbage = (deadData,dataService) => {
            emptyTrashBin(deadData,dataService)
        }
        this.renderFrontpage = () => view.renderFrontpage();
    }




});