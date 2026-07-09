


ccm.component({

    name: "mini_apps",

    ccm: "https://ccmjs.github.io/ccm/ccm.js",

    config: {



        html: ["ccm.load", {url: "./resources/templates.js", type: "module"}],

        user: ["ccm.start", "https://ccmjs.github.io/akless-components/user/ccm.user.js",{
            url: "https://ccm2.inf.h-brs.de",
            realm: "cloud",
            store: "dms-user",
            title: "Please enter Username and Password",
            hash: [ "ccm.load", { "url": "https://ccmjs.github.io/akless-components/modules/md5.mjs", "type": "module" } ],


        }],
        store: ["ccm.store", {
            name: "dms2-apps",
            url: "https://ccm2.inf.h-brs.de",


        }],
        configs: ["ccm.store", {
            name: "dms2-configs",
            url: "https://ccm2.inf.h-brs.de"
        }],
        comment:["ccm.store", {
            name:"dms2-comment-data",
        url:"https://ccm2.inf.h-brs.de"}],

        polls: ["ccm.store",{
            name: "live_poll_data",
            url: "wss://ccm2.inf.h-brs.de"
            }
        ],

        data: [ "ccm.store",
            { url: "https://ccm2.inf.h-brs.de", name: "dms2-comments" } ] ,

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
        ],
    },

    Instance:  function () {

        this.dataArray = []; //Hier werden alle Objekte gespeichert die fertig fürs render sind
        this.datasets = [];//Hier werden alle Apps gespeichert
        this.datasetsRest = [];// Hier wird alles gespeichert was keine App ist. 1. Eintrag: Bewertung von Apps ; 2. Eintrag: Bewertung von Kommentaren
        this.dataTemps = []; // Hier werden alle Kommentare der Kommentarkomponente gespeichert
        this.allComments = []; // Hier werden alle Kommentare einmal geladen

        this.start = async () => {
            //Loginscreen rendern wenn User nicht eingeloggt ist
            if(!this.user.isLoggedIn()){

                this.html.render(this.html.mainLogin(), this.element);
                await this.element.querySelector("#user").appendChild(this.user.root);
                return
            }

           await this.fetchData();
           console.log(this.dataArray)
            //Frontpage rendern nach einloggen
            console.log(this.dataArray)
            await this.html.render(this.html.frontpage(this.dataArray, this),this.element);

           this.getAllData();


        };


        this.fetchData = async () => {
            this.datasets =  await this.store.get({"_.creator": this.user.getValue().key}); //Apps abrufen
            console.log("allApss")
            console.log(this.datasets)
            configTemp =     await this.configs.get({"_.creator": this.user.getValue().key})//  Configs laden
            commentTemp =    await this.comment.get({"_.creator": this.user.getValue().key}) //Comment Component kommentare Laden wird gerade nicht gebraucht nur zum debugging
            this.allComments = await this.data.get({"_.creator": this.user.getValue().key})
            console.log(this.allComments)
            poll = await this.polls.get(); //Test um Poll Kollektion zu analysieren



            this.filterDataset();  //Datasets bereinigen und aufteilen
            this.filterComments(); // allComments bereinigen und aufteilen
            console.log(this.datasets);





             const configKeyMap = new Map(configTemp.map(ob => [ob.app, ob] )); //Aus den Configs eine Map machen sodass es laufzeit technisch besser geht sie ins dataArray zu laden

             this.dataTemps = await Promise.all(  this.datasets.map(async item => {
                //alle Apps durchgehen und alle Daten anfragen die zu dieser App gehören
                //So kriegt man jetzt auch Kommentare von anderen Benutzern
                            return await this.data.get({"app.2": item.app})
                    }
                )
            );

             x = await this.data.get()
            console.log("x")
            console.log(x)
            const commentMap = this.mapDataCollection();
            console.log("commentMap")
            console.log(commentMap)

            this.dataArray = await this.createRenderObject(configKeyMap, commentMap); //Hier wird das Objekt erstellt was am Ende gerendert werden soll



        };


        this.myFunction = async (index, comp) => {


            this.html.render(this.html.componentSite(this.datasets[index], comp, this),this.element);

            //this.html.render(this.html.commentSite(comp), this.element)
        }

        this.updateData = async (currentDataSet) => {
            await this.store.set(currentDataSet)
            console.log(currentDataSet);
        }

        this.deleteComponent = async (component) =>{
            console.log(component)
            this.store.del(component.key);
            this.configs.del(component.key);
            this.data.del(component.key)
            this.comment.del(component.key)
            await this.fetchData();
            this.html.render(this.html.frontpage(this.dataArray, this),this.element);
        }






        this.renderCommentSite = (comp) => {
            return this.html.commentSite(comp,this)
        }
        this.renderRestSite = () => {
            console.log("angekommen")
            this.mapRestData(this.datasetsRest);
            this.html.render(this.html.restSite(this.datasetsRest, this),this.element);
        }
        this.getAllData = async () => {
            const store = await this.ccm.store({
                name: "dms2-comments",
                url:"https://ccm2.inf.h-brs.de"
            })
            const allData = await store.get({"_.creator": this.user.getValue().key})
            console.log("Alle Daten");
            console.log(allData)

    }
        this.deleteComment = async (collection, comment) => {
            if(collection == "dms2-comment-data"){
                 await this.comment.del(comment)

            }else{
                if(collection == "dms2-comments"){
                    await this.data.del(comment)
                }
            }




    }
        this.filterDataset = () => {
            //Hier wird gefiltert alles was Apps sind bleibt in Datasets der rest geht nach datasetsRest
            const apps = []; //Temporärer speicher um Apps zwischen zu speichern


            for(const item of this.datasets){
                if(typeof item.app === "undefined"){ //wenn item.app nicht existiert ist es keine app => wird auf den Rest Stapel gepusht
                    this.datasetsRest.push(item);
                }else{
                    apps.push(item);
                }
            }
            this.datasets=apps;


        }
        this.filterComments = () => {

        }
        this.mapDataCollection = () => {
            let commentMap = new Map();
            this.dataTemps.forEach(objec => { //Kommentare mit Ihrem App schlüssel Mappen damit man sie leicht der App zuordnen kann

                if(objec.length == 0) return;
                objec.forEach(item => {
                    const key = item.key[2];

                    if (!commentMap.has(key)) { //Array für jeden neuen Schlüssel anlegen
                        commentMap.set(key, []);
                    }
                    //In das richtige Array das Objekt laden
                    commentMap.get(key).push(item);

                })



            });

            return commentMap;
        }
        this.createRenderObject = async (configKeyMap, commentMap) => {
            return await Promise.all(this.datasets.map(async (item) => { // aus jeder app die wichtigen Informationen für die mappen

                const obj = {
                    Titel: item.title,
                    Beschreibung: item.subject,
                    Icon: item.icon,
                    Komponente: item.component,
                    Config: configKeyMap.get(item.app), //Durch die Map kann man jetzt hier einfach Key paare vergleichen und die passende Config einfügen
                    Kommentare: commentMap.get(item.app) ? commentMap.get(item.app) : null

                };

                let testData = null;

                if (obj.Config?.data?.store?.length >= 1) { // Wenn store <1 ist gibt es keine Data

                    const store = await this.ccm.store(
                        obj.Config.data.store[1] //Die in der json hinterlegte store config laden damit man den richtigen store anspricht
                    );

                    testData = await store.get({app: obj.Config.data.key});
                    if(testData.length === 0){
                        testData = await this.polls.get(obj.Config.data.key);
                    }



                    if(testData) obj.data = testData; //Wenn data Inhalt hat füge es dem Objekt hinzu
                }

                return {
                    ...obj,

                };
            }));
        }
        this.mapRestData = async (dataset) => {
            //Map erstellen wo alle unterschiedlichen arten Von restDaten gespeichert werden Können unter ihrem Schlüssel
            let valuableApps = new Map([
                ["appRatings", []]
            ]);


            for (const key of Object.keys(dataset[0].ratings)) {
                const type = key.split(","); //Den Key ins Format [x,y] bringen sodass ich die Datenbank abfrage machen kann
                let temporaryData = await this.store.get(type)


                const obj = {
                    Titel: temporaryData.title,
                    Beschreibung: temporaryData.subject,
                    Icon: temporaryData.icon,
                    Komponente: temporaryData.component,
                    Ersteller: temporaryData.creator,
                    rating: dataset[0].ratings[key]

                };

                valuableApps.get('appRatings').push(obj)

            }
            console.log("ratings")
            console.log(valuableApps )
        }
    }

});