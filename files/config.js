// # Ghost Configuration
// Setup your Ghost install for various environments

var path = require('path'),
    config;

// Modifications for BlueMix compatibility
var postCreds;
var bluemixport = (process.env.VCAP_APP_PORT || '2368');
var bluemixhost = (process.env.VCAP_APP_HOST || '127.0.0.1');
var yaml = require('js-yaml');
var fs = require('fs');
var apphost = '';
var appdomain = '';
var appurl = '';

// Read Manifest.yml file to construct ghost application url or throw exception on error
try {
  var doc = yaml.safeLoad(fs.readFileSync('./manifest.yml', 'utf8'));
  apphost = doc.applications[0].host;
  appdomain = doc.applications[0].domain;
  appurl = 'http://' + apphost + '.' + appdomain;
} catch (e) {
  console.log(e);
}

if (process.env.VCAP_SERVICES) {
    var services = JSON.parse(process.env.VCAP_SERVICES);
    // look for a service starting with 'mysql'
    // MySQL is the only one supported by Ghost right now
    for (var svcName in services) {
        if (svcName.match(/^mysql/)) {
            postCreds = services[svcName][0]['credentials'];
            postCreds.client = 'mysql';
            postCreds.filename = '';
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

console.log(JSON.stringify(postCreds));

config = {
    // ### Development **(default)**
    development: {
        // The url to use when providing links to the site, E.g. in RSS and email.
        url: 'http://my_app_name.ng.bluemix.net',

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
            host: bluemixhost,
            // Port to be passed to node's `net.Server#listen()`, for iisnode set this to `process.env.PORT`
            port: bluemixport
        }
    }
};

// Export config
module.exports = config;
