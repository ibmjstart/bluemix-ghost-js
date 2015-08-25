// # Local File System Image Storage module
// The (default) module for storing images, using the local file system

var _       = require('lodash'),
    express = require('express'),
    fs      = require('fs-extra'),
    nodefn  = require('when/node/function'),
    path    = require('path'),
    when    = require('when'),
    errors  = require('../errors'),
    config  = require('../config'),
    util     = require('util'),
    Promise   = require('bluebird'),
    baseStore   = require('./base'),
    https =  require('https'),
    querystring = require('querystring'),
    dbname = 'ghost-images',
    imagestore,
    cloudantFileStore;

if (process.env.VCAP_APPLICATION) {
    var appdetails = JSON.parse(process.env.VCAP_APPLICATION);
    dbname = appdetails.name + '-ghost-images';
}

if (process.env.VCAP_SERVICES) {
    var services = JSON.parse(process.env.VCAP_SERVICES);
    // look for a service starting with 'CloudantNoSQLDB'
    //
    for (var svcName in services) {
        if (svcName.match(/^cloudantNoSQLDB/)) {
            cloudantCreds = services[svcName][0]['credentials'];
        }
    }
} else {
    console.log('No Cloudant CouchDB service attached');
}

var nano = require('nano')(cloudantCreds.url);

nano.db.get(dbname, function(err, body) {
    if (err) {
        nano.db.create(dbname, function(err, body) {
            if (!err) {
                console.log(dbname.toUpperCase() + ' database was successfully created');
                // Using the format  https://<username>:<password>@cloudant.com/api/set_permissions
                // Content-Type:  application/x-www-form-urlencoded
                // Post Body:  username=nobody&database=<username>/<dbname>&roles=_reader
                // The username "nobody" represents the "Everone Else" unauthenticated user group (aka Public)

                var data = querystring.stringify({
                    username: 'nobody',
                    database: cloudantCreds.username + '/' + dbname,
                    roles: '_reader'
                });

                var auth = 'Basic ' + new Buffer( cloudantCreds.username + ':' + cloudantCreds.password).toString('base64');

                var options = {
                    hostname: 'cloudant.com',
                    port: 443,
                    path: '/api/set_permissions',
                    method: 'POST',
                    headers: {
                        'Authorization' : auth,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(data)
                    }
                };

                console.log('Setting permissions to reader on ' + dbname.toUpperCase() + ' for unauthenticated users ...');
                var request=https.request(options, function(response) {
                    response.setEncoding('utf8');
                    response.on('data', function (chunk) {
                        if (JSON.parse(chunk).ok === true) {
                        //if (chunk.indexOf('ok') >= 0) {
                            console.log("Permissions successfully set.");
                        } else {
                            console.log("Permissions fail to set");
                            console.log(JSON.parse.ok);
                            console.log('Body: ' + chunk);
                        }
                    });
                });
                request.write(data);
                request.end();
                imagestore = nano.use(dbname);
            } else {
                console.log(dbname.toUpperCase() + ' database has failed to be created');
                console.log('Reason: ' + err.error);
            }
        });
    } else {
        console.log(dbname.toUpperCase() + ' database already exists and will be used.');
        imagestore = nano.use(dbname);
    }
});

function CloudantFileStore() {
}
util.inherits(CloudantFileStore, baseStore);

// ### Save
// Saves the image to storage (the file system)
// - image is the express image object
// - returns a promise which ultimately returns the full url to the uploaded image
CloudantFileStore.prototype.save = function (image) {
    var saved = when.defer(),
        targetDir = this.getTargetDir(config.get().paths.imagesPath),
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
        var fullUrl = (config.get().paths.subdir + '/' + path.relative(config.get().paths.appRoot, targetFilename)).replace(new RegExp('\\' + path.sep, 'g'), '/');
        console.log("Full Local URL: " + fullUrl)
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
        //console.log(cloudantCreds.url + '/' + dbname + '/' + base + fullUrl);
        var cloudantImageUrl = cloudantCreds.url + '/' + dbname + '/' + base + fullUrl;

        //Let's try to find a document with the same label as the image and then drill down to find the image attachment
        imagestore.get(base, {revs_info: true}, function(err, getBody) {
            if (err) {
                console.log('{SAVE} Could not find the doc: ' + base);
                console.log('Reason: ' + err.error);
                // Error recorded should be missing to indicate this is in fact a brand new image
                //Create new document with name of filename
                imagestore.insert({ type: 'ghost.js' }, base, function(err, insertBody) {
                    if (err) {
                        // Log any errors encountered for troubleshooting
                        console.log('{SAVE} Could not insert the doc: ' + base);
                        console.log('Reason: ' + err.error);
                    } else {
                        console.log('{SAVE} Successfully inserted doc: ' + base)
                        // Let's make this more asynchronous friendly
                        fs.readFile('/home/vcap/app' + fullUrl, function(err, data) {
                            console.log('{SAVE} data.length==' + data.length);
                            // Attach image to the newly created document
                            imagestore.attachment.insert(insertBody.id, fullUrl, new Buffer(data, 'binary'), contentType, {rev: insertBody.rev}, function(err, attachBody) {
                                if (err) {
                                    // Log any errors encountered for troubleshooting
                                    console.log('{SAVE} Could not insert the image' + fullUrl);
                                    console.log('Reason: ' + err.error);
                                } else {
                                    console.log('{SAVE} Successfully inserted image: ' + fullUrl);
                                }
                            });
                            // Let's get rid of this file now that it has been persisted.
                            fs.unlink('/home/vcap/app' + fullUrl);
                        });
                    }
                });
            } else {
                // Looks like a document already exists with this image name.  Let's update it with the new attachment
                console.log('{SAVE} An image attachment already exists with this name');

                imagestore.attachment.get(base, fullUrl,  function(err, getAttachBody) {
                    if (!err) {
                        console.log('{SAVE} Duplicate attachment image located');
                        // Let's make this more asynchronous friendly
                        fs.readFile('/home/vcap/app' + fullUrl, function(err, data) {
                            console.log('{SAVE} data.length==' + data.length);
                            imagestore.attachment.insert(base, fullUrl, new Buffer(data, 'binary'), contentType, {rev: getBody._rev}, function(err, attachBody) {
                                if (err) {
                                    // Log any errors encountered for troubleshooting
                                    console.log('{SAVE} Could not insert the updated image');
                                    console.log('Reason: ' + JSON.stringify(err));
                                } else {
                                    console.log('{SAVE} Successfully updated image: ' + fullUrl);
                                }
                            });
                            // Let's get rid of this file now that it has been persisted.
                            fs.unlink('/home/vcap/app' + fullUrl);
                        });

                    } else {
                        console.log('{SAVE} Did not find duplicate attachment');
                        console.log('Reason: ' + err.error);
                    }
                });

            }

        });

        // Let's give Cloudant a wee bit of time to get the data and create the doc + attachment.  Say 1000 ms seems like a good first approx.
        setTimeout(function() {return saved.resolve(cloudantImageUrl);}, 1000);

    }).otherwise(function (e) {
        errors.logError(e);
        return saved.reject(e);
    });

    return saved.promise;
}

CloudantFileStore.prototype.exists = function (filename) {
    // fs.exists does not play nicely with nodefn because the callback doesn't have an error argument
    var done = when.defer();
    var extension = path.extname(filename);
    var base = path.basename(filename, extension);
    var fullname = base + extension;
    var fullUrl = (config.get().paths.subdir + '/' + path.relative(config.get().paths.appRoot, filename)).replace(new RegExp('\\' + path.sep, 'g'), '/');

    // Let's try to get this image from Cloudant by checking for the doc first
    imagestore.get(base, {revs_info: true}, function(err, getBody) {
        if (err) {
            // Couldn't find the doc.  Record the reason and notify as false.
            console.log('{EXISTS} Could not find the doc: ' + base);
            console.log('Reason: ' + err.error);
            done.resolve(false);
        } else {
            console.log('{EXISTS} Found image document in Cloudant cache: ' + base);
            // Let's try to get the image attachment associated with this doc
            imagestore.attachment.get(base, fullUrl, function (err, attachBody) {
                if (!err) {
                    // We found it.  Notify as true.
                    console.log('{EXISTS} Found image attachment: ' + fullUrl)
                    done.resolve(false);    // Let's fall through the same code as not being there.
                } else {
                    // Not there.  Record the reason and notify as false
                    console.log('{EXISTS} Could not find the image ' + fullUrl);
                    console.log('Reason: ' + err.error);
                    done.resolve(false);
                }
            });
        }
    });

    return done.promise;
}

// middleware for serving the files
CloudantFileStore.prototype.serve = function () {
    var ONE_HOUR_MS = 60 * 60 * 1000,
        ONE_YEAR_MS = 365 * 24 * ONE_HOUR_MS;

    // For some reason send divides the max age number by 1000
    return express.static(config.get().paths.imagesPath, {maxAge: ONE_YEAR_MS});
}

module.exports = CloudantFileStore;

