const { ensureDir, mkdirp, remove } = require("fs-extra");
const Repository = require("./repository");
const OcflObject = require("./ocflObject");

const DIGEST_ALGORITHM = "sha512";

describe("Repository initialisation", () => {
  let repository;
  const ocflRoot = "test-repository-output";
  beforeEach(async () => {});
  afterEach(async () => {
    await remove(ocflRoot);
  });

  test(`should be able to create a repository`, async () => {
    if (!(await ensureDir(ocflRoot))) await mkdirp(ocflRoot);
    repository = new Repository({ ocflRoot });
    expect(repository.ocflRoot).toEqual(ocflRoot);

    try {
      await repository.create();
      expect(true).toBeTruthy();
    } catch (error) {}
  });
  test(`should fail to create a repository - folder doesn't exist`, async () => {
    repository = new Repository({ ocflRoot });
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual("Directory does not exist");
    }
  });
  test(`should fail to create a repository - already a repo`, async () => {
    if (!(await ensureDir(ocflRoot))) await mkdirp(ocflRoot);
    repository = new Repository({ ocflRoot });
    await repository.create();
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual(
        "This repository has already been initialized."
      );
    }
  });
  test(`should fail to create a repository - not empty folder`, async () => {
    repository = new Repository({ ocflRoot: "./test-data" });
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual(
        `Can't initialise a repository as there are already files.`
      );
    }
  });
  test(`should find a repository`, async () => {
    repository = new Repository({ ocflRoot });
    if (!(await ensureDir(ocflRoot))) await mkdirp(ocflRoot);
    await repository.create();
    expect(await repository.isRepository()).toBe(true);
  });
  test(`should not find a repository`, async () => {
    repository = new Repository({ ocflRoot: "./test-data" });
    expect(await repository.isRepository()).toBe(false);
  });
  test(`should find one object in the repository - THIS IS AN EMITTER`, async () => {
    // create a repository
    if (!(await ensureDir(ocflRoot))) await mkdirp(ocflRoot);
    repository = new Repository({ ocflRoot });
    expect(repository.ocflRoot).toEqual(ocflRoot);
    await repository.create();

    let object = new OcflObject({ ocflRoot, id: "xx1" });
    await object.update({ source: "./test-data/simple-ocfl-object" });

    repository.findObjects({});
    repository.on("object", (object) => {
      expect(object.objectPath).toEqual("/xx/1");
      object = new OcflObject(object);
      expect(object.id).toEqual("/xx/1");
    });
  });
  test(`should find 3 objects in the repository - THIS IS AN EMITTER`, async () => {
    // create a repository
    if (!(await ensureDir(ocflRoot))) await mkdirp(ocflRoot);
    repository = new Repository({ ocflRoot });
    expect(repository.ocflRoot).toEqual(ocflRoot);
    await repository.create();

    let object = new OcflObject({ ocflRoot, id: "xx1" });
    await object.update({ source: "./test-data/simple-ocfl-object" });
    object = new OcflObject({ ocflRoot, id: "xx2" });
    await object.update({ source: "./test-data/simple-ocfl-object" });
    object = new OcflObject({ ocflRoot, id: "xx3" });
    await object.update({ source: "./test-data/simple-ocfl-object" });

    repository.findObjects({});
    let objects = [];
    repository.on("object", (object) => objects.push(object));
    setTimeout(() => {
      expect(objects.length).toEqual(3);
    }, 200);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });
});
