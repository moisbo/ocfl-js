const { ensureDir, mkdirp, remove, writeFile } = require("fs-extra");
const Repository = require("./repository");
const { Bucket } = require("./s3");
const pairtree = require("pairtree");
const path = require("path");
const { range } = require("lodash");
const chance = require("chance").Chance();

describe("Filesystem Repository tests", () => {
  let repository;
  const base = path.join(__dirname, "..", "filesystem-repo");
  const ocflRoot = path.join(base, chance.word());
  const ocflScratch = path.join(base, chance.word());
  beforeEach(async () => {
    await ensureDir(ocflRoot);
    await ensureDir(ocflScratch);
  });
  afterEach(async () => {
    await remove(ocflRoot);
    await remove(ocflScratch);
  });
  afterAll(async () => {
    await remove(base);
  });

  test(`should be able to create a new repository`, async () => {
    repository = new Repository({ ocflRoot, ocflScratch });
    expect(repository.ocflRoot).toEqual(ocflRoot);
    try {
      await repository.create();
      expect(true).toBeTruthy();
    } catch (error) {}
  });
  test(`should fail to create a repository - OCFL root doesn't exist`, async () => {
    await remove(ocflRoot);
    repository = new Repository({ ocflRoot, ocflScratch });
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toMatch(
        /The OCFL root directory .* doesn't exist./
      );
    }
  });
  test(`should fail to create repo - scratch space doesn't exist`, async () => {
    await remove(ocflScratch);
    let repository = new Repository({ ocflRoot, ocflScratch });

    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toMatch(
        /The OCFL scratch directory .* doesn't exist./
      );
    }
  });
  test(`should fail to create a repository - already a repo`, async () => {
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual(
        "This repository has already been initialized."
      );
    }
  });
  test(`should fail to create a repository - folder not empty`, async () => {
    repository = new Repository({ ocflRoot: "./test-data", ocflScratch });
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual(
        `Can't initialise a repository as there are already files.`
      );
    }
  });
  test(`should fail to create a repository - scratch subpath of root`, async () => {
    repository = new Repository({
      ocflRoot,
      ocflScratch: path.join(ocflRoot, chance.word()),
    });
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual(
        `'ocflScratch' cannot be a subpath of 'ocflRoot'`
      );
    }
  });
  test(`should find a repository`, async () => {
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
    expect(await repository.isRepository()).toBe(true);
  });
  test(`should not find a repository`, async () => {
    repository = new Repository({ ocflRoot: "./test-data", ocflScratch });
    expect(await repository.isRepository()).toBe(false);
  });
  test(`should find one object in the repository - THIS IS AN EMITTER`, async () => {
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();

    let id = chance.hash();
    let object = repository.object({ id });
    await object.update({ source: "./test-data/simple-ocfl-object" });

    repository.findObjects();
    repository.on("object", async (o) => {
      expect(o.ocflRoot).toEqual(ocflRoot);
      expect(o.pairtreeId).toEqual(pairtree.path(object.id).slice(0, -1));

      await o.load();
      let inventory = await o.getLatestInventory();
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
  });
  test(`should find 3 objects in the repository - THIS IS AN EMITTER`, async () => {
    // create a repository
    if (!(await ensureDir(ocflRoot))) await mkdirp(ocflRoot);
    repository = new Repository({ ocflRoot, ocflScratch });
    expect(repository.ocflRoot).toEqual(ocflRoot);
    await repository.create();

    let object = repository.object({ ocflRoot, id: "xx1" });
    await object.update({ source: "./test-data/simple-ocfl-object" });
    object = repository.object({ ocflRoot, id: "xx2" });
    await object.update({ source: "./test-data/simple-ocfl-object" });
    object = repository.object({ ocflRoot, id: "xx3" });
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

describe("S3 Repository tests", () => {
  const base = path.join(__dirname, "..", "s3-repo");
  const ocflScratch = path.join(base, chance.word());
  const configuration = {
    type: "S3",
    ocflScratch,
    s3: {
      bucket: "test-bucket2",
      accessKeyId: "minio",
      secretAccessKey: "minio_pass",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
    },
  };
  beforeEach(async () => {
    await ensureDir(ocflScratch);
  });
  afterEach(async () => {
    await remove(ocflScratch);
  });
  afterAll(async () => {
    await remove(base);
  });

  test(`should be able to create a new repository`, async () => {
    let repository = new Repository(configuration);

    await repository.create();
    expect(await repository.isRepository()).toBe(true);

    const bucket = new Bucket(configuration.s3);
    await bucket.removeObjects({ keys: ["0=ocfl_1.0"] });
  });
  test(`should fail to create repo - scratch space doesn't exist`, async () => {
    await remove(ocflScratch);
    let repository = new Repository(configuration);

    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toMatch(
        /The OCFL scratch directory .* doesn't exist./
      );
    }
  });
  test(`should fail to create a repository - already a repo`, async () => {
    repository = new Repository(configuration);
    await repository.create();
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual(
        "This repository has already been initialized."
      );
    }
    const bucket = new Bucket(configuration.s3);
    await bucket.removeObjects({ keys: ["0=ocfl_1.0"] });
  });
  test(`should fail to create a repository - bucket not empty`, async () => {
    repository = new Repository(configuration);
    const bucket = new Bucket(configuration.s3);
    await bucket.upload({
      localPath: path.join(__dirname, "./s3.js"),
      target: "s3.js",
    });
    try {
      await repository.create();
    } catch (error) {
      expect(error.message).toEqual(
        `Can't initialise a repository as there are already files.`
      );
    }
    await bucket.removeObjects({ keys: ["s3.js"] });
  });
  test(`should find one object in the repository - THIS IS AN EMITTER`, async () => {
    repository = new Repository(configuration);
    try {
      await repository.create();
    } catch (error) {}

    const source = path.join(ocflScratch, chance.hash());
    await ensureDir(source);
    await writeFile(path.join(source, "file1.txt"), "some stuff");

    const id = chance.hash();
    const object = repository.object({ id });
    await object.update({ source });

    repository.findObjects();
    repository.on("object", (o) => {
      expect(o.objectPath).toEqual(object.id);
    });
    await object.bucket.removeObjects({ prefix: id });
  });
  test(`should find 3 objects in the repository - THIS IS AN EMITTER`, async () => {
    repository = new Repository(configuration);
    try {
      await repository.create();
    } catch (error) {}

    const source = path.join(ocflScratch, chance.hash());
    await ensureDir(source);
    await writeFile(path.join(source, "file1.txt"), "some stuff");

    let ids = [];
    let object;
    let totalObjects = 3;
    for (let i in range(totalObjects)) {
      let id = chance.hash();
      ids.push(id);
      object = repository.object({ id });
      await object.update({ source });
    }

    repository.findObjects({});
    let objects = [];
    repository.on("object", (o) => objects.push(o));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(objects.length).toEqual(totalObjects);
    for (let id of ids) {
      object = repository.object({ id });
      await object.bucket.removeObjects({ prefix: id });
    }
  });
});
