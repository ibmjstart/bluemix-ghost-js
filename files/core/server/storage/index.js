var errors = require('../errors'),
    storage;

function getStorage() {
    var storageChoice = 'cloudant';
    var StorageConstructor;

    if (storage) {
        return storage;
    }

    try {
        // TODO: determine if storage has all the necessary methods
        StorageConstructor = require('./' + storageChoice);
    } catch (e) {
        errors.logError(e);
    }
    storage = new StorageConstructor();
    return storage;
}

module.exports.getStorage = getStorage;