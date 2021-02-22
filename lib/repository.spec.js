const { ensureDir, mkdirp, remove } = require("fs-extra");
const Repository = require("./repository");
const { Bucket } = require("./s3");
const path = require("path");
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
    let object = repository.ocflObject.init({ id });
    await object.update({ source: "./test-data/simple-ocfl-object" });

    repository.findObjects();
    repository.on("object", (o) => {
      expect(o.ocflRoot).toEqual(ocflRoot);
      expect(o.objectPath).toEqual(object.id);
    });
  });
  test(`should find 3 objects in the repository - THIS IS AN EMITTER`, async () => {
    // create a repository
    if (!(await ensureDir(ocflRoot))) await mkdirp(ocflRoot);
    repository = new Repository({ ocflRoot, ocflScratch });
    expect(repository.ocflRoot).toEqual(ocflRoot);
    await repository.create();

    let object = repository.ocflObject.init({ ocflRoot, id: "xx1" });
    await object.update({ source: "./test-data/simple-ocfl-object" });
    object = repository.ocflObject.init({ ocflRoot, id: "xx2" });
    await object.update({ source: "./test-data/simple-ocfl-object" });
    object = repository.ocflObject.init({ ocflRoot, id: "xx3" });
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
      bucket: "test-bucket",
      accessKeyId: "minio",
      secretAccessKey: "minio_pass",
      endpoint: "http://localhost:9000",
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

    try {
      await repository.create();
    } catch (error) {}
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
  test(`should find a repository`, async () => {
    repository = new Repository(configuration);
    await repository.create();
    expect(await repository.isRepository()).toBe(true);
  });
});
