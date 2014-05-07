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
    // look for a service starting with 'User Provided'
    //
    for (var svcName in services) {
        if (svcName.match(/^user-provided/)) {
            cloudantCreds = services[svcName][0]['credentials'];
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

            // Let's assume PNG images are the norm and toggle the content-type from there
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
            //console.log('https://' + cloudantCreds.url + '/' + cloudantCreds.database + '/' + base + fullUrl);
            var cloudantImageUrl = 'https://' + cloudantCreds.url + '/' + cloudantCreds.database + '/' + base + fullUrl;
            var data = fs.readFileSync('/home/vcap/app' + fullUrl);

            //Let's try to find a document with the same label as the image and then drill down to find the image attachment
            ghostimages.get(base, {revs_info: true}, function(err, getBody) {
                if (err) {
                    console.log('Could not find the doc');
                    console.log(err.error);
                    // Error recorded should be missing to indicate this is in fact a brand new image
                    //Create new document with name of filename
                    ghostimages.insert({ type: 'ghost.js' }, base, function(err, insertBody) {
                        if (err) {
                            // Log any errors encountered for troubleshooting
                            console.log('Could not insert the doc');
                            console.log(err.reason);
                        } else {
                            // Attach image to the newly created document
                             ghostimages.attachment.insert(insertBody.id, fullUrl, new Buffer(data, 'binary'), contentType, {rev: insertBody.rev}, function(err, attachBody) {
                                if (err) {
                                    // Log any errors encountered for troubleshooting
                                    console.log('Could not insert the image');
                                    console.log(err.reason);
                                }
                             });
                        }
                    });
                } else {
                    // Looks like a document already exists with this image name.  Let's update it with the new attachment
                    ghostimages.attachment.insert(getBody.id, fullUrl, new Buffer(data, 'binary'), contentType, {rev: getBody.rev}, function(err, attachBody) {
                        if (err) {
                            // Log any errors encountered for troubleshooting
                            console.log('Could not insert the updated image');
                            console.log(err.reason);
                            console.log(cloudantImageUrl);
                            setTimeout(function() {return saved.resolve(cloudantImageUrl);}, 750);
                        }
                    });
                }

            });

            // Let's give Cloudant a wee bit of time to get the data and create the doc + attachment.  Say 750 ms seems like a good first approx.
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

        // Let's try to get this image from Cloudant by checking for the doc first
        ghostimages.get(filename, {revs_info: true}, function(err, getBody) {
            if (err) {
                // Couldn't find the doc.  Record the reason and notify as false.
                console.log('Could not find the doc: ' + filename);
                console.log(err.reason);
                done.resolve(false);
            } else {
                console.log('Found image document in Cloudant cache');
                // Let's try to get the image attachment associated with this doc
                ghostimages.attachment.get(base, filename, function (err, attachBody) {
                    if (!err) {
                        // We found it.  Notify as true.
                        done.resolve(true);
                    } else {
                        // Not there.  Record the reason and notify as false
                        console.log('Could not attach the image');
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
