


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
        console.log()
         this.dataArray = [];
        this.datasets = [];

        this.start = async () => {
            if(!this.user.isLoggedIn()){

                this.html.render(this.html.mainLogin(), this.element);
                await this.element.querySelector("#user").appendChild(this.user.root);
                return
            }
            document.body.style.margin = "0";
            document.body.style.padding = "0";





           await this.fetchData();
           console.log(this.dataArray)




            await this.html.render(this.html.frontpage(this.dataArray, this),this.element);


        };


        this.fetchData = async () => {
             datasets = await this.store.get({"_.creator": this.user.getValue().key});
            console.log(datasets);

            this.dataArray = datasets.map((item) =>{
                return{
                    Titel: item.title,
                    Beschreibung: item.subject,
                    Icon: item.icon,
                    Komponente: item.component
                }

            });

        };

        this.myFunction = async (index) => {
            console.log(datasets)
            this.html.render(this.html.componentSite(datasets[index], this),this.element);
        }

        this.updateData = async (currentDataSet) => {
            await this.store.set(currentDataSet)
            console.log(currentDataSet);
        }

        this.deleteComponent = async (component) =>{
            console.log(component)
            this.store.del(component.key);
            await this.fetchData();
            this.html.render(this.html.frontpage(this.dataArray, this),this.element);
        }




    function mapDataSets(datasets){

    }


    }
});