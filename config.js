// # Ghost Configuration
// Setup your Ghost install for various environments

var path = require('path'),
    config;

var util = require('util');
var postCreds;
var bluemixport = (process.env.VCAP_APP_PORT || '2368');
var bluemixhost = (process.env.VCAP_APP_HOST || '127.0.0.1');

console.log(process.env.VCAP_SERVICES);

if (process.env.VCAP_SERVICES) {
    var services = JSON.parse(process.env.VCAP_SERVICES);
    // look for a service starting with 'postgresql' or 'mysql'
    // these are the two database types supported by Ghost right now
    for (var svcName in services) {
        if (svcName.match(/^postgresql/)) {
            postCreds = services[svcName][0]['credentials'];
            postCreds.client = 'pg';
            postCreds.filename = '';
        } else if (svcName.match(/^mysql/)) {
            postCreds = services[svcName][0]['credentials'];
            postCreds.client = 'mysql';
            postCreds.filename = '';
        } else if (svcName.match(/^cleardb/)) {
            postCreds = services[svcName][0]['credentials'];
	    postCreds.client = 'mysql';
            postCreds.filename = '';
	}
    }
} else {
    console.log('oops');
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

console.log(JSON.stringify(postCreds));

config = {
    // ### Development **(default)**
    development: {
        // The url to use when providing links to the site, E.g. in RSS and email.
        url: 'http://ghostme.ng.bluemix.net',

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
            client: 'sqlite3',
            connection: {
                filename: path.join(__dirname, '/content/data/ghost-dev.db')
            },
            debug: false
        },
        server: {
            // Host to be passed to node's `net.Server#listen()`
            host: '127.0.0.1',
            // Port to be passed to node's `net.Server#listen()`, for iisnode set this to `process.env.PORT`
            port: '2368'
        }
    },

    // ### Production
    // When running Ghost in the wild, use the production environment
    // Configure your URL and mail settings here
    production: {
        // TODO:  CHANGE URL to match your BlueMix APP Name
        url: 'http://ghostme.ng.bluemix.net',
        mail: {},
        database: {
            client: postCreds.client,
            connection: {
               filename: postCreds.filename,
               host: postCreds.hostname,
               user: postCreds.username,
               password: postCreds.password,
               database: postCreds.name,
               port: postCreds.port,
               charset: 'utf8'
            },
            debug: false
        },
        server: {
            // Host to be passed to node's `net.Server#listen()`
            host: util.format('%s',bluemixhost),
            // Port to be passed to node's `net.Server#listen()`, for iisnode set this to `process.env.PORT`
            port: util.format('%s',bluemixport)
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
            }
        },
        server: {
            host: '127.0.0.1',
            port: '2369'
        }
    },

    // ### Travis
    // Automated testing run through GitHub
    'travis-sqlite3': {
        url: 'http://127.0.0.1:2369',
        database: {
            client: 'sqlite3',
            connection: {
                filename: path.join(__dirname, '/content/data/ghost-travis.db')
            }
        },
        server: {
            host: '127.0.0.1',
            port: '2369'
        }
    },

    // ### Travis
    // Automated testing run through GitHub
    'travis-mysql': {
        url: 'http://127.0.0.1:2369',
        database: {
            client: 'mysql',
            connection: {
                host     : '127.0.0.1',
                user     : 'travis',
                password : '',
                database : 'ghost_travis',
                charset  : 'utf8'
            }
        },
        server: {
            host: '127.0.0.1',
            port: '2369'
        }
    },

    // ### Travis
    // Automated testing run through GitHub
    'travis-pg': {
        url: 'http://127.0.0.1:2369',
        database: {
            client: 'pg',
            connection: {
                host     : '127.0.0.1',
                user     : 'postgres',
                password : '',
                database : 'ghost_travis',
                charset  : 'utf8'
            }
        },
        server: {
            host: '127.0.0.1',
            port: '2369'
        }
    }
};

// Export config
module.exports = config;
