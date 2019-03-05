# Notes

## How this should work

    ocfl = require('ocfl');

    const repo = new ocfl.repo(MY_REPOSITORY_URI)

    const objects = await repo.index();

    const object = await repo.object(MY_OBJECT_URI);

    const new_object = await repo.add_object(dir);

    const version = await object.add_version(dir);

    const 