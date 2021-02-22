- [About](#about)
- [Installation](#installation)
- [Running the tests](#running-the-tests)
- [Overview](#overview)
- [API - Repository](#api---repository)
	- [Initialisation](#initialisation)
	- [Creating a repository](#creating-a-repository)
	- [Check if path is a repository](#check-if-path-is-a-repository)
	- [Find objects in a repository - THIS IS AN EVENT EMITTER](#find-objects-in-a-repository---this-is-an-event-emitter)
- [API - OCFL Object](#api---ocfl-object)
	- [Create an object with an ID - ingest a folder](#create-an-object-with-an-id---ingest-a-folder)
	- [Create an object with a path](#create-an-object-with-a-path)
	- [Create an object with an ID - pass in a callback that will write to deposit path](#create-an-object-with-an-id---pass-in-a-callback-that-will-write-to-deposit-path)
	- [Break out of an update before committing to the repository](#break-out-of-an-update-before-committing-to-the-repository)
	- [Check if object exists at path](#check-if-object-exists-at-path)
	- [Check if object can be created in the repo at path](#check-if-object-can-be-created-in-the-repo-at-path)
	- [Load an object and getLatestInventory](#load-an-object-and-getlatestinventory)
	- [Get object versions](#get-object-versions)
	- [Load object and get information from it](#load-object-and-get-information-from-it)
	- [Get the diff between two versions](#get-the-diff-between-two-versions)
	- [Verify the internal state of an object](#verify-the-internal-state-of-an-object)
	- [Resolve file path relative to object root](#resolve-file-path-relative-to-object-root)
	- [Export an object](#export-an-object)
	- [Remove an object](#remove-an-object)

# About

This is a library to create and interact with Oxford Common File Layout (OCFL) filesystems and objects within them. This implementation is a fork of the version written by Mike Lynch at [UTS-eResearch](https://github.com/UTS-eResearch/ocfl-js).

# Installation

1. Get the code:
   `git clone https://github.com/CoEDL/ocfl-js`
2. Install it
   ```
   cd ocfl-js
   npm install
   ```

# Running the tests

The tests can be run once off:

> npm run test

Or in watch mode

> npm run test:watch

In both cases a minio docker container (s3 compatible object storage) will first be started as this is required for the s3 tests. The container will be setup with a bucket and credentials as follows:

```
> BUCKET_NAME: test-bucket
> ACCESS_KEY_ID: minio
> SECRET_KEY: minio_pass
> ENDPOINT: http://localhost:9000
```

In fact you can browse the bucket in your browser via the endpoint url and log in with access key and secret above. See `docker-compose.yml` for details.

# Overview

There is one entry point - Repository. Repository is used to create a repository, find objects within a repository and manage repository objects.

# API - Repository

## Initialisation

In all cases you must first get a handle to the repository:

```
const repository = new Repository({
	ocflRoot: '/path/to/repo',
	ocflScratch: '/path/to/scratch/space'
});
```

> `ocflScratch` is optional but if not provided you will not be able to operate on any objects. You can just retrieve files from them.

## Creating a repository

```
// ensure the target folder for the repo exists
if (!await fs.exists(ocflRoot)) await fs.mkdirp(ocflRoot);
if (!await fs.exists(ocflScratch)) await fs.mkdirp(ocflScratch);


// define the repo
repository = new Repository({ ocflRoot: {/path/to/repo}, ocflScratch: {/path/to/scratch/space} });

// create it
await repository.create()
```

> ocflScratch cannot be a subpath of ocflRoot. Also, it must be big enough to hold a few objects being operated on at the same time (this is where the deposit first occurs and backups are made when updating existing objects)

## Check if path is a repository

```
// check for namaste file and return true or false
await repository.isRepository()
```

## Find objects in a repository - THIS IS AN EVENT EMITTER

```
// find objects
repository.findObjects({});

// register with the 'object' event
repository.on("object", object=> {
	console.log(object)
	// returns an object that can be used in the constructor for OcflObject
});
```

# API - OCFL Object

General note: `update` will load the object and latest version state and return that
on successful update so you will automatically have the current internal file state
available.

In all cases you must first have a handle to the repo (see [Initialisation](#initialisation)) before
you then create a handle to an object via an id or path, e.g.:

```
const repository = new Repository({ ocflRoot, ocflScratch})
let object = repository.ocflObject.init({ id: 'some-id });
```

## Create an object with an ID - ingest a folder

```
// define the object
let object = repository.ocflObject.init({ id: 'some-id });

// create (v1) or update object with content at `source`
await object.update({ source: '/path/to/some/content' });

// add some data to content at `source`

// update object with content at `source` - v2
await object.update({ source: '/path/to/some/content' });
```

## Create an object with a path

```
// define the object
let object = repository.ocflObject.init({ objectPath: '/path/to/object' });
```

## Create an object with an ID - pass in a callback that will write to deposit path

```
await object.update({ writer: writeContent  });

async function writeContent({ target }) {
	for (let file of files ) {
		await // write file to target (DEPOSIT PATH)
	}
}
```

## Break out of an update before committing to the repository

There maybe occasions where you wish to break out of an update before the object is commit back in to
the repo. Perhaps you want to check the changes and decide to abort. This is possible as follows:

1. set `commit: false` on the update method

```
({ inventory } = await object.update({
      writer: writeContent,
      commit: false,
}));
```

2. load the object

```
await object.load();
```

3. Do what you need with the object. At this point the internal state is set to the object in the deposit path so after loading you can get versions and perform a diff on versions. This is the object just before it would be commit back to the repo.

```
versions = await object.getVersions();
versions = {
  next: versions.pop().version,
  previous: versions.pop().version,
};
diff = await object.diffVersions(versions);

// diff looks like
//
//    {
//      same: [ 'v1/content/dir/fileX.txt', 'v1/content/fileY.txt' ],
//      previous: [],
//      next: [
//        'v2/content/repo-metadata/metadata.json',
//        'v2/content/something-new.txt'
//      ]
//    }
decide = diff.next.filter((filename) => !filename.match(/repo-metadata/));
```

4.  Decide what to do based on the diff - continue with the commit

```
await object.commit({ inventory });
```

5. Decide what to do based on the diff - abort the commit

```
await object.cleanup();
```

See the test `'it should be able to break out of an update and diff two versions'` in ocflObject.spec.js for a working example.

**This method will verify the object before applying the commit and throw an error if the verfication
fails**

## Check if object exists at path

```
await object.isObject()
```

## Check if object can be created in the repo at path

```
await object.isAvailable()
```

## Load an object and getLatestInventory

```
// load the object
await object.load();

// get the latestInventory
const inventory = await object.getLatestInventory();
```

## Get object versions

```
// load the object
await object.load()

// get the versions of the object
let versions = object.getVersions()
```

## Load object and get information from it

```
// load the object
await object.load()

// get latest inventory
let r = await object.getLatestInventory()

// get latest version state (the manifest of files for that version)
let r = await object.getLatestVersion()

// get specific version inventory
let r = await object.getInventory({version: 'v2'})

// get specific version state
let r = await object.getVersion({version: 'v2'})

// load all version states in one hit - COULD BE VERY EXPENSIVE
await object.getAllVersions()
```

## Get the diff between two versions

Two get a diff between two object versions:

```
let diff = await object.diffVersions({previous: 'v1', next: 'v2' })

// And get a result like:
//    {
//      same: [ 'v1/content/dir/fileX.txt', 'v1/content/fileY.txt' ],
//      previous: [],
//      next: [
//        'v2/content/repo-metadata/metadata.json',
//        'v2/content/something-new.txt'
//      ]
//    }
```

## Verify the internal state of an object

This method will check that all inventoried files exist within the object and have the correct hash as
well as checking that all real files are found in the inventory files.

```
await object.update({ writer: writeContent });
let { isValid, errors } = await object.verify();
```

- isValid: Boolean
- errors: Array of errors discovered

## Resolve file path relative to object root

```
// resolve a path relative to the object root
file = object.resolveFilePath({ filePath: 'relative/path/to/file})

// returns a full path to the object relative to ocflRoot
```

## Export an object

```
// export it
await object.export({target: '/path/to/export/folder' })

// OR export a specific version of the object
await object.export({target: '/path/to/export/folder', version: 'v2'  })
```

## Remove an object

```
// remove it
await object.remove()
```
