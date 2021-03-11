- [About](#about)
- [Installation](#installation)
- [Running the tests](#running-the-tests)
- [Overview](#overview)
- [API - Repository](#api---repository)
	- [Initialisation](#initialisation)
		- [Filesystem backend](#filesystem-backend)
		- [S3 Backend](#s3-backend)
	- [Creating a repository](#creating-a-repository)
	- [Check if path is a repository](#check-if-path-is-a-repository)
	- [Find objects in a repository - THIS IS AN EVENT EMITTER](#find-objects-in-a-repository---this-is-an-event-emitter)
- [API - OCFL Object](#api---ocfl-object)
	- [Create an object with an ID](#create-an-object-with-an-id)
	- [Ingest a folder of content into the object](#ingest-a-folder-of-content-into-the-object)
	- [Pass in a callback that will write to deposit path](#pass-in-a-callback-that-will-write-to-deposit-path)
	- [Merge new content into an object](#merge-new-content-into-an-object)
	- [Two stage update / commit - break out of an update before committing to the repository](#two-stage-update--commit---break-out-of-an-update-before-committing-to-the-repository)
	- [Remove files and update version](#remove-files-and-update-version)
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
	- [Get a presigned URL to a file](#get-a-presigned-url-to-a-file)

# About

This is a library to create and interact with Oxford Common File Layout (OCFL) filesystems and objects within them. This implementation is a fork of the version written by Mike Lynch at [UTS-eResearch](https://github.com/UTS-eResearch/ocfl-js).

This library can work with OCFL repositories on disk (filesystem backend) or in an S3 bucket (S3 or S3 like system).

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
> BUCKET_NAME: test-bucket{1..3}
> ACCESS_KEY_ID: minio
> SECRET_KEY: minio_pass
> ENDPOINT: http://localhost:9000
```

In fact you can browse the bucket in your browser via the endpoint url and log in with access key and secret above. See `docker-compose.yml` for details.

# Overview

There is one entry point - Repository. Repository is used to create a repository, find objects within a repository and manage repository objects.

# API - Repository

## Initialisation

A repository can live on a filesystem or in S3 object storage. In all cases you must first get a handle to the repository before you can do anything else. The API for both backends is exactly the same. Just the initialisation varies.

### Filesystem backend

To get a handle to a repository on a filesystem:

```
const repository = new Repository({
	ocflRoot: '/path/to/repo',
	ocflScratch: '/path/to/scratch/space'
});
```

> `ocflScratch` is optional but if not provided you will not be able to operate on any objects. You can just retrieve files from them.

### S3 Backend

To get a handle to a repository in an S3 bucket:

```
const configuration = {
    type: "S3",
    ocflScratch: '/path/to/scratch/space',
    s3: {
      bucket: "test-bucket3",
      accessKeyId: "minio",
      secretAccessKey: "minio_pass",
      endpoint: "http://localhost:9000",
    },
};

const repository = new Repository(configuration);
```

> The example shows hard coded values for the S3 options though you'd probably get them
> from the environment in normal usage.

> `ocflScratch` is optional but if not provided you will not be able to operate on any objects. You can just retrieve files from them.

## Creating a repository

```
// ensure the target folder for the repo exists
if (!await fs.exists(ocflRoot)) await fs.mkdirp(ocflRoot);
if (!await fs.exists(ocflScratch)) await fs.mkdirp(ocflScratch);

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
repository.findObjects();

// register with the 'object' event
repository.on("object", object=> {
	console.log(object)
	// returns an object that can be used in the constructor for OcflObject
});
```

# API - OCFL Object

> The API for working with an object is exactly the same regardless of whether the backend is a filesystem or an S3 bucket.

> In all cases you must first have a handle to the repo (see [Initialisation](#initialisation)) before
> you then create a handle to an object via an id, e.g.:

```
const repository = new Repository({ ocflRoot, ocflScratch})
let object = repository.object({ id: 'some-id });
```

## Create an object with an ID

```
// define the object
let object = repository.object({ id: 'some-id });
```

## Ingest a folder of content into the object

```
// create (v1) or update object with content at `source`
await object.update({ source: '/path/to/some/content' });

// add some data to content at `source`

// update object with content at `source` - v2
await object.update({ source: '/path/to/some/content' });
```

## Pass in a callback that will write to deposit path

You callback will be called with an object containing one param `target` which will be the
path to write your content to.

```
await object.update({ writer: writeContent  });

async function writeContent({ target }) {
	for (let file of files ) {
		await // write file to target (DEPOSIT PATH)
	}
}
```

## Merge new content into an object

By default, calling `update` on an object will create a new version from the content you pull in
during update. However, if you just want to add some content to an existing object without needing
all of the current data you can perform an update in `merge` mode.

```
await object.update({ source: '/path/to/some/content', updateMode: 'merge' })

or

await object.update({ writer: writeContent, updateMode: 'merge' })
```

## Two stage update / commit - break out of an update before committing to the repository

There maybe occasions where you wish to break out of an update before the object is commit back in to
the repo. Perhaps you want to check the changes and decide to abort. This is possible as follows:

1. set `commit: false` on the update method

```
({ inventory } = await object.update({
      writer: writeContent,
      commit: false,
}));
```

2. Do what you need with the object. At this point the internal state is set to the object in the deposit path so after loading you can get versions and perform a diff on versions. This is the object just before it would be commit back to the repo.

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

3.  Decide what to do based on the diff - continue with the commit

```
await object.commit({ inventory });
```

4. Decide what to do based on the diff - abort the commit

```
await object.cleanup();
```

See the test `'it should be able to break out of an update and diff two versions'` in ocflObject.spec.js for a working example.

**This method will verify the object before applying the commit and throw an error if the verfication
fails**

## Remove files and update version

To create a new version with a file removed from the previous version you can either create
a whole new version in the state you want via `update` or you can just ask for a new version
to be created without the file.

```
await object.update({ removeFiles: ["file1.txt"] });
```

> Note: This does not delete the actual file from previous versions or rewrite the inventories in any
> way. It just stamps a new version without a ref to the file or files. If you actually need to remove
> something from an OCFL then you need to remove the whole object from the repo and reingest it
> as new with the content removed from it. See: [Remove an object](#remove-an-object)

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

## Get a presigned URL to a file

> Only available when the backend is S3

When using and S3 backend for the repository you can get a presigned url to a file so that
your service can load the file from AWS directly. Just provide the `name (target)` of the file and the `version`
that you want.

```
// get presigned url
let url = await object.getPresignedUrl({
    version: "v1",
    target: "sample/file_0.txt",
});
```
