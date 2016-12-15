// # Ghost Configuration
// Setup your Ghost install for various environments

var path = require('path'),
    config;
const url = require('url');

// Modifications for BlueMix compatibility
var postCreds;
var postCredsUrl;
var cloudantCreds;
var bluemixport = (process.env.VCAP_APP_PORT || '2368');
var bluemixhost = (process.env.VCAP_APP_HOST || '127.0.0.1');
var appurl = '';

// Read Manifest.yml file to construct ghost application url or throw exception on error
try {
  appurl = 'https://' + JSON.parse(process.env.VCAP_APPLICATION)["application_uris"][0];
} catch (e) {
  console.log(e);
}

if (process.env.VCAP_SERVICES) {
    var services = JSON.parse(process.env.VCAP_SERVICES);
    // look for a service starting with 'mysql'
    // MySQL is the only one supported by Ghost right now
    for (var svcName in services) {
        if (svcName.match(/^user-provided/)) {
            postCreds = services[svcName][0]['credentials'];
            postCredsUrl = url.parse(postCreds.uri, true);
            if (postCredsUrl.protocol === "mysql:") {
              postCreds.client = 'mysql';
            } else if (postCredsUrl.protocol === "postgres:"){
              postCreds.client = 'pg';
            }
            postCreds.filename = '';

        } else if (svcName.match(/^cloudantNoSQLDB/)) {
            cloudantCreds = services[svcName][0]['credentials'];
            cloudantCreds.client = 'cloudant';
            cloudantCreds.filename = '';
        }
    }
} else {
    // Let's assume we're running locally and populate
    postCreds = {
        name : '',
        host : '127.0.0.1',
        port : '2368',
        user : '',
        password : '',
        client : 'mysql',
        filename : path.join(__dirname, '/content/data/ghost-dev.db')
    };
}

config = {
    // ### Development **(default)**
    development: {
        // The url to use when providing links to the site, E.g. in RSS and email.
        // Change this to your Ghost blog's published URL.
        url: 'http://localhost:2368',

        // Example refferer policy
        // Visit https://www.w3.org/TR/referrer-policy/ for instructions
        // default 'origin-when-cross-origin',
        // referrerPolicy: 'origin-when-cross-origin',

        // Example mail config
        // Visit http://support.ghost.org/mail for instructions
        // ```
        //  mail: {
        //      transport: 'SMTP',
        //      options: {
        //          service: 'Mailgun',
        //          auth: {
        //              user: '', // mailgun username
        //              pass: ''  // mailgun password
        //          }
        //      }
        //  },
        // ```

        // #### Database
        // Ghost supports sqlite3 (default), MySQL & PostgreSQL
        database: {
            client: 'sqlite3',
            connection: {
                filename: path.join(__dirname, '/content/data/ghost-dev.db')
            },
            debug: false
        },
        // #### Server
        // Can be host & port (default), or socket
        server: {
            // Host to be passed to node's `net.Server#listen()`
            host: '127.0.0.1',
            // Port to be passed to node's `net.Server#listen()`, for iisnode set this to `process.env.PORT`
            port: '2368'
        },
        // #### Paths
        // Specify where your content directory lives
        paths: {
            contentPath: path.join(__dirname, '/content/')
        }
    },

    // ### Production
    // When running Ghost in the wild, use the production environment
    // Configure your URL and mail settings here
    production: {
    	// URL constructed from data within the manifest.yml file.
        url: appurl,

        // Example mail config
        // Visit http://docs.ghost.org/mail for instructions
        // ```
        //  mail: {
        //      transport: 'SMTP',
        //      options: {
        //          service: 'Mailgun',
        //          auth: {
        //              user: '', // mailgun username
        //              pass: ''  // mailgun password
        //          }
        //      }
        //  },
        // ```

        database: {
            client: postCreds.client,
            connection: {
               filename: postCreds.filename,
               host: postCredsUrl.hostname,
               user: postCredsUrl.auth.split(':')[0],
               password: postCredsUrl.auth.split(':')[1],
               database: postCredsUrl.pathname.substr(1),
               port: postCredsUrl.port,
               charset: 'utf8'
            },
            debug: false
        },
        server: {
            // Host to be passed to node's `net.Server#listen()`
            host: bluemixhost,
            // Port to be passed to node's `net.Server#listen()`, for iisnode set this to `process.env.PORT`
            port: bluemixport
        },
        storage: {
            active: 'cloudant',
            'cloudant': {
                host: cloudantCreds.host,
                password: cloudantCreds.password,
                port: cloudantCreds.port,
                url: cloudantCreds.url,
                username: cloudantCreds.username
            }
        },
        mail: {
            transport: 'SMTP',
            from: '"Bluemix Ghost Blogger" <create_new_account@gmail.com>',
            options: {
                service: 'Gmail',
                auth: {
                    // http://support.ghost.org/mail/
                    // https://accounts.google.com/SignUp
                    user: 'create_new_account@gmail.com',
                    pass: 'newpassword'
                }
            }
        }
    },
    // **Developers only need to edit below here**

    // ### Testing
    // Used when developing Ghost to run tests and check the health of Ghost
    // Uses a different port number
    testing: {
        url: 'http://127.0.0.1:2369',
        database: {
            client: 'sqlite3',
            connection: {
                filename: path.join(__dirname, '/content/data/ghost-test.db')
            },
            pool: {
                afterCreate: function (conn, done) {
                    conn.run('PRAGMA synchronous=OFF;' +
                    'PRAGMA journal_mode=MEMORY;' +
                    'PRAGMA locking_mode=EXCLUSIVE;' +
                    'BEGIN EXCLUSIVE; COMMIT;', done);
                }
            },
            useNullAsDefault: true
        },
        server: {
            host: '127.0.0.1',
            port: '2369'
        },
        logging: false
    },

    // ### Testing MySQL
    // Used by Travis - Automated testing run through GitHub
    'testing-mysql': {
        url: 'http://127.0.0.1:2369',
        database: {
            client: 'mysql',
            connection: {
                host     : '127.0.0.1',
                user     : 'root',
                password : '',
                database : 'ghost_testing',
                charset  : 'utf8'
            }
        },
        server: {
            host: '127.0.0.1',
            port: '2369'
        },
        logging: false
    },

    // ### Testing pg
    // Used by Travis - Automated testing run through GitHub
    'testing-pg': {
        url: 'http://127.0.0.1:2369',
        database: {
            client: 'pg',
            connection: {
                host     : '127.0.0.1',
                user     : 'postgres',
                password : '',
                database : 'ghost_testing',
                charset  : 'utf8'
            }
        },
        server: {
            host: '127.0.0.1',
            port: '2369'
        },
        logging: false
    }
};

// Export config
module.exports = config;
