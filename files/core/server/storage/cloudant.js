// # Local File System Image Storage module
// The (default) module for storing images, using the local file system

var _       = require('lodash'),
    express = require('express'),
    fs      = require('fs-extra'),
    nodefn  = require('when/node/function'),
    path    = require('path'),
    when    = require('when'),
    errors  = require('../errorHandling'),
    config  = require('../config'),
    baseStore   = require('./base'),

    cloudantFileStore;


if (process.env.VCAP_SERVICES) {
    var services = JSON.parse(process.env.VCAP_SERVICES);
    // look for a service starting with 'MongoDB'
    // We are going to leverage the Mongo's GridFS functionality
    for (var svcName in services) {
        if (svcName.match(/^user-provided/)) {
            cloudantCreds = services[svcName][0]['credentials'];
            console.log(JSON.stringify(cloudantCreds));
        }
    }
} else {
    console.log('No Cloudant CouchDB service attached');
}

var nano = require('nano')('http://' + cloudantCreds.username + ':' + cloudantCreds.password + '@' + cloudantCreds.url);
var ghostimages = nano.use(cloudantCreds.database);

cloudantFileStore = _.extend(baseStore, {
    // ### Save
    // Saves the image to storage (the file system)
    // - image is the express image object
    // - returns a promise which ultimately returns the full url to the uploaded image
    'save': function (image) {
        var saved = when.defer(),
            targetDir = this.getTargetDir(config().paths.imagesPath),
            targetFilename;

        this.getUniqueFileName(this, image, targetDir).then(function (filename) {
            targetFilename = filename;
            return nodefn.call(fs.mkdirs, targetDir);
        }).then(function () {
            return nodefn.call(fs.copy, image.path, targetFilename);
        }).then(function () {
            return nodefn.call(fs.unlink, image.path).otherwise(errors.logError);
        }).then(function () {
            // The src for the image must be in URI format, not a file system path, which in Windows uses \
            // For local file system storage can use relative path so add a slash
            var fullUrl = (config().paths.subdir + '/' + path.relative(config().paths.appRoot, targetFilename)).replace(new RegExp('\\' + path.sep, 'g'), '/');
            var contentType = 'image/png';
            var extension = path.extname(targetFilename);
            switch (extension) {
                case '.jpg | .jpeg':
                    contentType = 'image/jpeg';
                    break;
                case '.png':
                    contentType = 'image/png';
                    break;
                case '.gif':
                    contentType = 'image/gif';
                    break;
                case '.svg | .svgz':
                    contentType = 'image/svg+xml';
                    break;
                default:
                    contentType = 'image';
                    break;
            }

            var base = path.basename(targetFilename, extension);
            //console.log(base);
            //console.log(extension);
            //console.log(fullUrl);
            console.log('https://' + cloudantCreds.url + '/' + cloudantCreds.database + '/' + base + fullUrl);
            var cloudantImageUrl = 'https://' + cloudantCreds.url + '/' + cloudantCreds.database + '/' + base + fullUrl;
            var data = fs.readFileSync('/home/vcap/app' + fullUrl);

            ghostimages.get(base, {revs_info: true}, function(err, getBody) {
                if (err) {
                    console.log(err.error);
                    console.log('I am hoping the err above means that doc does not exist');
                    //Create new document with name of filename
                    ghostimages.insert({ type: 'ghost.js' }, base, function(err, insertBody) {
                        if (err) {
                            console.log(err.reason);
                        } else {
                             ghostimages.attachment.insert(insertBody.id, fullUrl, new Buffer(data, 'binary'), contentType, {rev: insertBody.rev}, function(err, attachBody) {
                                if (err) {
                                    console.log(err.reason);
                                }
                             });
                        }
                    });
                } else {
                    console.log('This doc already exists and just needs updating');
                    ghostimages.attachment.insert(getBody.id, fullUrl, new Buffer(data, 'binary'), contentType, {rev: getBody.rev}, function(err, attachBody) {
                        if (err) {
                            console.log(err.reason);
                        }
                    });
                }

            });

            /*

            */

            setTimeout(function() {return saved.resolve(cloudantImageUrl);}, 750);

        }).otherwise(function (e) {
            errors.logError(e);
            return saved.reject(e);
        });

        return saved.promise;
    },

    'exists': function (filename) {
        // fs.exists does not play nicely with nodefn because the callback doesn't have an error argument
        var done = when.defer();
        var extension = path.extname(filename);
        var base = path.basename(filename, extension);
        var fullname = base + extension;

            console.log(filename);
            console.log(fullname);

                console.log('We have hit the exists else branch ...');
                ghostimages.get(filename, {revs_info: true}, function(err, getBody) {
                    if (err) {
                        console.log(err.reason);
                        done.resolve(false);
                    } else {
                        console.log('Found image document in Cloudant cache');
                        //cosnole.log('Let us ressurect back to disk');
                        ghostimages.attachment.get(base, filename, function (err, attachBody) {
                            if (!err) {
                                console.log('Resurrected file from Cloudant cache');
                                //fs.writeFile(filename, attachBody);
                                done.resolve(true);
                            } else {
                                console.log('Getting Cloudant cache version has failed');
                                console.log(err.reason);
                                done.resolve(false);
                            }
                        });
                    }
                });

        return done.promise;
    },

    // middleware for serving the files
    'serve': function () {
        var ONE_HOUR_MS = 60 * 60 * 1000,
            ONE_YEAR_MS = 365 * 24 * ONE_HOUR_MS;

        // For some reason send divides the max age number by 1000
        return express['static'](config().paths.imagesPath, {maxAge: ONE_YEAR_MS});
    }
});

module.exports = cloudantFileStore;
