# README

## Planned API

Here's an outline:

	ocfl = require('ocfl');

    # object representing a repository

 	const repo = new ocfl.repo(MY_REPOSITORY_URI)

    # objects: a list of URIs for each of the repo's contents

	const objects = await repo.objects();

	# object: look up a single object and return an object
	# which has its OCFL metadata

 	const object = await repo.object(MY_OBJECT_URI);

    # Add a directory with files in to the repository. This
    # should either build the manifest with hashes, or, if it's
    # a BagIt bag, get the hashes from the bag

 	const new_object = await repo.add_object(dir);

 	# This updates an object: adds the directory as a second version
 	# and returns a js object representing the new object

 	const versioned_object = await repo.update_object(MY_OBJECT_URI, dir);

We should probably compare this with efforts in other languages like Python

## What we've got so far

- The inventory function in index.js builds the manifest and OCFL inventory
for a directory.

- The starter of a class Repository

    - test with `npm test`
