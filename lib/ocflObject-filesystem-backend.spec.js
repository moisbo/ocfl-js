const path = require("path");
const {
  remove,
  ensureDir,
  ensureFile,
  writeFile,
  readdir,
  copy,
} = require("fs-extra");
const Repository = require("./repository");
const chance = require("chance").Chance();

describe("Testing object creation functionality", () => {
  const sourceData = "./test-data/simple-ocfl-object";
  let source;

  const base = path.join(__dirname, "..", "filesystem-repo-ocfl1");
  const ocflRoot = path.join(base, chance.word());
  const ocflScratch = path.join(base, chance.word());

  let repository, object;

  beforeAll(async () => {
    await ensureDir(ocflRoot);
    await ensureDir(ocflScratch);
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
  });
  beforeEach(async () => {
    source = path.join(ocflScratch, chance.word());
    await copy(sourceData, source);
  });
  afterEach(async () => {
    await remove(source);
  });
  afterAll(async () => {
    await remove(base);
  });

  test("should be able to create an object with one version", async () => {
    object = repository.object({ id: chance.hash() });

    // v1 create object and import folder
    await object.update({ source });

    let inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v1");
    expect(Object.keys(inventory.versions).length).toEqual(1);
    expect(inventory.manifest).toEqual({
      "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99": [
        "v1/content/sample/file_0.txt",
      ],
    });
  });
  test(`should fail to create an object because there's already one in deposit`, async () => {
    let id = chance.hash();
    await ensureDir(path.join(ocflScratch, "deposit", id));
    try {
      object = repository.object({ id: chance.hash() });
      await object.update({ source });
    } catch (error) {
      expect(error.message).toEqual(
        "An object with that ID is already in the deposit path."
      );
    }
  });
  test.skip(`should be able to create an object given a path`, async () => {
    const objectPath = "/xx/yy/zz";
    object.init({ objectPath });
    await object.update({ source });
    await object.load();
    const inventory = await object.getLatestInventory();
    expect(inventory.id).toEqual(objectPath);
  });
  test(`should fail to create an object as a child of another`, async () => {
    let id = "/xx/yy";
    object = repository.object({ id });
    await object.update({ source });

    id2 = `${id}/zz`;
    object = repository.object({ id: id2 });
    try {
      await object.update({ source });
    } catch (error) {
      expect(error.message).toEqual(
        `This object is a child of an existing object and that's not allowed.`
      );
    }
  });
  test.skip(`should be able to load an object from a path`, async () => {
    const id = chance.hash();
    object.init({ id });
    await object.update({ source });
    await object.load();
    const inventory = await object.getLatestInventory();
    expect(inventory.manifest).toEqual({
      "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99": [
        "v1/content/sample/file_0.txt",
      ],
    });
  });
  test("should be able to create an object with two versions by adding a file", async () => {
    object = repository.object({ id: chance.hash() });

    // v1
    await object.update({ source });

    // v2 add a file
    let file = path.join(source, "file1.txt");
    await writeFile(file, "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    let inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v2");
    expect(Object.keys(inventory.versions).length).toEqual(2);
    expect(inventory.manifest).toEqual({
      de01d675497715d6e139c1182eeb4e9c73cfe25df4f1006a8e75679910c7b897707591bd574f27f21c50a6f624e737284c5271431302afa0bac8b66a342e3617: [
        "v2/content/file1.txt",
      ],
      "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99": [
        "v1/content/sample/file_0.txt",
      ],
    });
  });
  test("should be able to create an object with three versions by adding another file", async () => {
    object = repository.object({ id: chance.hash() });

    // v1
    await object.update({ source });

    // v2 add a file
    let file1 = path.join(source, "file1.txt");
    await writeFile(file1, "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });
    let inventory = await object.getLatestInventory();

    // v3 add another file
    let file2 = path.join(source, "file2.txt");
    await writeFile(file2, "fsf v$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    inventory = await object.getLatestInventory();
    expect(inventory.head).toEqual("v3");
    expect(Object.keys(inventory.versions).length).toEqual(3);
  });
  test("should be able to create an object with four versions by changing an existing file", async () => {
    object = repository.object({ id: chance.hash() });

    await object.update({ source });

    // v2 add a file
    await writeFile(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v3 add another file
    await writeFile(path.join(source, "file2.txt"), "fsf v$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v4 change the content of a file
    await writeFile(path.join(source, "file1.txt"), "fsf v$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    let inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v4");
    expect(Object.keys(inventory.versions).length).toEqual(4);
    expect(inventory.manifest).toEqual({
      ea832e64995b2a7d64358abe682e9c0abfb015d22278a78ac17cb2d0a0ac2f9dfc02f5fb2e6baf37a77480a5be0b32957d0e9f979a77403ffb70a8dae1e319d8: [
        "v4/content/file1.txt",
        "v3/content/file2.txt",
      ],
      "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99": [
        "v1/content/sample/file_0.txt",
      ],
    });
  });
  test("should be able to create an object with five versions by removing an existing file", async () => {
    object.init({ id: chance.hash() });
    // v1
    await object.update({ source });

    // v2 add a file
    await writeFile(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v3 add another file
    await writeFile(path.join(source, "file2.txt"), "fsf v$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    await // v4 change the content of a file
    await writeFile(path.join(source, "file1.txt"), "fsf v$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v5 remove a file
    await remove(path.join(source, "file2.txt"));
    await object.update({ source });

    let inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v5");
    expect(Object.keys(inventory.versions).length).toEqual(5);
    expect(inventory.manifest).toEqual({
      ea832e64995b2a7d64358abe682e9c0abfb015d22278a78ac17cb2d0a0ac2f9dfc02f5fb2e6baf37a77480a5be0b32957d0e9f979a77403ffb70a8dae1e319d8: [
        "v4/content/file1.txt",
      ],
      "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99": [
        "v1/content/sample/file_0.txt",
      ],
    });
  });
  test("should remain at one version when there is no change to the source", async () => {
    object = repository.object({ id: chance.hash() });
    await object.update({ source });
    await object.update({ source });
    await object.update({ source });

    let inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v1");
    expect(Object.keys(inventory.versions).length).toEqual(1);
    expect(inventory.manifest).toEqual({
      "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99": [
        "v1/content/sample/file_0.txt",
      ],
    });
  });
  test("should be able to create an object with a callback to write the content", async () => {
    object = repository.object({ id: chance.hash() });
    await object.update({ writer: writeContent });

    let inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v1");
    expect(Object.keys(inventory.versions).length).toEqual(1);
    expect(inventory.manifest).toEqual({
      "3abea15c00b706b25bd01ef29bfbe4fc117bb3464d0ba178bb2d924d71b758dd660dbef464e896ad4ec86e4bb498a7b58abb11b958875c468193cc42995b249e": [
        "v1/content/dir/fileX.txt",
      ],
      "9fb7cdf68ceaa2425e9e8f761e6b89c95250f63ae014c757436760caf9c28b2b368a173b340616ccbba0377c0c724a2d67a6c968a3b91968f72a8ed0da95e6cf": [
        "v1/content/fileY.txt",
      ],
    });
  });
  test("should handle an object being written with a source folder and a callback", async () => {
    object = repository.object({ id: chance.hash() });
    // v1 - load a source folder
    await object.update({ source });

    // v2 - write some content via a callback
    await object.update({ writer: writeContent });

    inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v2");
    expect(Object.keys(inventory.versions).length).toEqual(2);
    expect(inventory.manifest).toEqual({
      "3abea15c00b706b25bd01ef29bfbe4fc117bb3464d0ba178bb2d924d71b758dd660dbef464e896ad4ec86e4bb498a7b58abb11b958875c468193cc42995b249e": [
        "v2/content/dir/fileX.txt",
      ],
      "9fb7cdf68ceaa2425e9e8f761e6b89c95250f63ae014c757436760caf9c28b2b368a173b340616ccbba0377c0c724a2d67a6c968a3b91968f72a8ed0da95e6cf": [
        "v2/content/fileY.txt",
      ],
    });
  });
  test("should object to both source and writer being defined", async () => {
    object = repository.object({ id: chance.hash() });
    try {
      await object.update({ source, writer: () => {} });
    } catch (error) {
      expect(error.message).toEqual(
        "Specify only one of 'source', 'writer' or 'removeFiles'."
      );
    }
  });
  test("should object because neither source nor writer is defined", async () => {
    object = repository.object({ id: chance.hash() });
    try {
      await object.update({});
    } catch (error) {
      expect(error.message).toEqual(
        "Specify at least one of 'source', 'writer' or 'removeFiles'."
      );
    }
  });
  test(`should not be able to export - target folder doesn't exist`, async () => {
    object = repository.object({ id: chance.hash() });

    // v1 create object and import folder
    await object.update({ source });
    try {
      await object.export({ target: "./notfolder" });
    } catch (error) {
      expect(error.message).toEqual(`Export target folder doesn't exist.`);
    }
  });
  test(`should not be able to export - target folder not empty`, async () => {
    object = repository.object({ id: chance.hash() });

    // v1 create object and import folder
    await object.update({ source });
    try {
      await object.export({ target: "./test-data" });
    } catch (error) {
      expect(error.message).toEqual(`Export target folder isn't empty.`);
    }
  });
  test("should be able to export an object with one version - automatically select head", async () => {
    object = repository.object({ id: chance.hash() });
    const exportFolder = path.join(ocflScratch, chance.hash());
    await object.update({ source });
    await ensureDir(exportFolder);
    await object.export({ target: exportFolder });
    let content = await readdir(exportFolder);
    expect(content).toEqual(["sample"]);
    content = await readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await remove(exportFolder);
  });
  test("should be able to export an object with one version - select v1", async () => {
    object = repository.object({ id: chance.hash() });
    const exportFolder = path.join(ocflScratch, chance.hash());
    await object.update({ source });
    await ensureDir(exportFolder);
    await object.export({ target: exportFolder, version: "v1" });

    let content = await readdir(exportFolder);
    expect(content).toEqual(["sample"]);
    content = await readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await remove(exportFolder);
  });
  test("should be able to export a version from an object with two versions - select v1", async () => {
    object = repository.object({ id: chance.hash() });
    const exportFolder = path.join(ocflScratch, chance.hash());

    // v1
    await object.update({ source });

    // v2 add a file
    await writeFile(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // export
    await ensureDir(exportFolder);
    await object.export({ target: exportFolder, version: "v1" });

    let content = await readdir(exportFolder);
    expect(content).toEqual(["sample"]);
    content = await readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await remove(exportFolder);
  });
  test("should be able to export a version from an object with two versions - select v2", async () => {
    object = repository.object({ id: chance.hash() });
    const exportFolder = path.join(ocflScratch, chance.hash());

    // v1
    await object.update({ source });

    // v2 add a file
    await writeFile(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // export
    await ensureDir(exportFolder);
    await object.export({ target: exportFolder, version: "v2" });

    let content = await readdir(exportFolder);
    expect(content).toEqual(["file1.txt", "sample"]);
    content = await readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await remove(exportFolder);
  });

  async function writeContent({ target }) {
    const CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
    };
    const files = Object.keys(CONTENT);
    for (const f of files) {
      const d = path.join(target, path.dirname(f));
      await ensureDir(d);
      await writeFile(path.join(target, f), CONTENT[f]);
    }
  }
});

describe("Testing object manipulation functionality - object with one version", () => {
  const sourceData = "./test-data/simple-ocfl-object";
  let source;

  const base = path.join(__dirname, "..", "filesystem-repo-ocfl2");
  const ocflRoot = path.join(base, chance.word());
  const ocflScratch = path.join(base, chance.word());

  let repository, object;

  beforeAll(async () => {
    await ensureDir(ocflRoot);
    await ensureDir(ocflScratch);
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
  });
  beforeEach(async () => {
    source = path.join(ocflScratch, chance.word());
    await copy(sourceData, source);
  });
  afterEach(async () => {
    await remove(source);
  });
  afterAll(async () => {
    await remove(base);
  });

  test("should be able to get the latest inventory", async () => {
    object = repository.object({ id: chance.hash() });

    // v1 create object and import folder
    await object.update({ source });
    await object.load();
    const inventory = await object.getLatestInventory();
    expect(inventory.head).toEqual("v1");
  });
  test("should be able to get the v1 inventory", async () => {
    object = repository.object({ id: chance.hash() });

    // v1 create object and import folder
    await object.update({ source });
    await object.load();
    const inventory = await object.getInventory({ version: "v1" });
    expect(inventory.head).toEqual("v1");
  });
  test("should be able to get the versions from an object with one version", async () => {
    object = repository.object({ id: chance.hash() });

    // v1 create object and import folder
    await object.update({ source });
    await object.load();

    let versions = await object.getVersions();
    expect(versions.length).toEqual(1);
    expect(versions[0].version).toEqual("v1");
  });
  test(`should be able to see if it's an OCFL object`, async () => {
    object = repository.object({ id: chance.hash() });

    let isObject = await object.isObject();
    expect(isObject).toBe(false);

    // v1 create object and import folder
    await object.update({ source });

    isObject = await object.isObject();
    expect(isObject).toBe(true);
  });
  test(`should be able to see if it's available`, async () => {
    object = repository.object({ id: chance.hash() });

    let isAvailable = await object.isAvailable();
    expect(isAvailable).toBe(true);

    // v1 create object and import folder
    await object.update({ source });

    isAvailable = await object.isAvailable();
    expect(isAvailable).toBe(false);
  });
  test("should be able to get the state from an object with one version", async () => {
    object.init({ id: chance.hash() });
    // v1 create object and import folder
    await object.update({ source });
    await object.load();

    let versions = await object.getVersions();
    expect(versions.length).toEqual(1);
    expect(versions[0].version).toEqual("v1");

    let content = await object.getVersion({ version: "v1" });
    expect(content.version).toEqual("v1");
    expect(content.state).toEqual({
      "file_0.txt": [
        {
          name: "file_0.txt",
          path: "v1/content/sample/file_0.txt",
          hash:
            "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99",
          version: 1,
        },
      ],
    });
  });
  test("should be able to get the latest state from an object with one version", async () => {
    object.init({ id: chance.hash() });
    // v1 create object and import folder
    await object.update({ source });
    await object.load();

    let versions = await object.getVersions();
    expect(versions.length).toEqual(1);
    expect(versions[0].version).toEqual("v1");

    let content = await object.getLatestVersion();
    expect(content.version).toEqual("v1");
    expect(content.state).toEqual({
      "file_0.txt": [
        {
          name: "file_0.txt",
          path: "v1/content/sample/file_0.txt",
          hash:
            "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99",
          version: 1,
        },
      ],
    });
  });
  test("should be able to get all states from an object with one version", async () => {
    object.init({ id: chance.hash() });
    // v1 create object and import folder
    await object.update({ source });
    await object.load();

    let versions = await object.getVersions();
    expect(versions.length).toEqual(1);
    expect(versions[0].version).toEqual("v1");

    let content = await object.getAllVersions();
    expect(content.length).toEqual(1);
    content = content.pop();
    expect(content.version).toEqual("v1");
    expect(content.state).toEqual({
      "file_0.txt": [
        {
          name: "file_0.txt",
          path: "v1/content/sample/file_0.txt",
          hash:
            "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99",
          version: 1,
        },
      ],
    });
  });
  test("should be able to remove an object from the repository", async () => {
    object.init({ id: chance.hash() });
    await object.update({ source });
    let isObject = await object.isObject();
    expect(isObject).toBe(true);
    const result = await object.remove();
    expect(result).toBe(null);

    isObject = await object.isObject();
    expect(isObject).toBe(false);

    isAvailable = await object.isAvailable();
    expect(isAvailable).toBe(true);
  });
  test(`should be able to resolve a file path relative to the object`, async () => {
    object.init({ id: chance.hash() });
    // v1 create object and import folder
    await object.update({ source });
    await object.load();

    let version = await object.getLatestVersion();

    let file = version.state["sample/file_0.txt"].pop();
    file = object.resolveFilePath({ filePath: file.path });
    expect(file).toMatch(/v1\/content\/sample\/file_0.txt/);
  });
});

describe("Testing object manipulation functionality - merging and deleting content", () => {
  const sourceData = "./test-data/simple-ocfl-object";

  const base = path.join(__dirname, "..", "filesystem-repo-ocfl3");
  const ocflRoot = path.join(base, chance.word());
  const ocflScratch = path.join(base, chance.word());

  let repository, source, file1, file2;

  beforeAll(async () => {
    await remove(base);
    await ensureDir(ocflRoot);
    await ensureDir(ocflScratch);
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
  });
  beforeEach(async () => {
    source = path.join(ocflScratch, chance.word());
    await copy(sourceData, source);
    file1 = path.join(source, "file1.txt");
    file2 = path.join(source, "file2.txt");
  });
  afterEach(async () => {
    await remove(source);
  });
  afterAll(async () => {
    await remove(base);
  });

  test("it should be able to merge in a file without having the whole current object", async () => {
    let object = repository.object({ id: chance.hash() });
    // console.log(object);

    await object.update({ source });
    let version = await object.getLatestVersion();
    version = await object.getLatestVersion();
    expect(version.version).toEqual("v1");

    const newstuff = path.join(ocflScratch, "new-stuff");
    await ensureDir(newstuff);
    await writeFile(path.join(newstuff, "new-file.txt"), "some content");

    await object.update({ source: newstuff, updateMode: "merge" });

    let data = await object.getLatestVersion();
    expect(data.version).toEqual("v2");
    expect(Object.keys(data.state).sort()).toEqual([
      "file_0.txt",
      "new-file.txt",
    ]);
    expect(data.state["new-file.txt"][0].path).toEqual(
      "v2/content/new-file.txt"
    );
    expect(data.state["new-file.txt"][0].version).toEqual(2);
    expect(data.state["file_0.txt"][0].path).toEqual(
      "v1/content/sample/file_0.txt"
    );
    expect(data.state["file_0.txt"][0].version).toEqual(1);

    let inventory = await object.getLatestInventory();
    expect(inventory.head).toEqual("v2");
    expect(inventory.manifest).toEqual({
      "65c256c639bd6dd483be341831c19a3996954901bb2a07f79593f3e3af5692559bdb124d099c2b92ced7e59b7ed02d3b7f42d50740d999bebd91983db2842762": [
        "v2/content/new-file.txt",
      ],
      "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99": [
        "v1/content/sample/file_0.txt",
      ],
    });

    await remove(newstuff);
  });
  test("it should be able to delete a file without having the whole current object", async () => {
    let object = repository.object({ id: chance.hash() });

    await writeFile(file1, "some content");
    await writeFile(file2, "some content");
    // console.log(object);

    await object.update({ source });

    await object.update({ removeFiles: ["file1.txt"] });
    let data = await object.getLatestVersion();

    expect(data.version).toEqual("v2");
    expect(Object.keys(data.state).sort()).toEqual(["file2.txt", "file_0.txt"]);
    expect(data.state["file2.txt"][0].path).toEqual("v1/content/file2.txt");
    expect(data.state["file2.txt"][0].version).toEqual(1);

    expect(data.state["file_0.txt"][0].path).toEqual(
      "v1/content/sample/file_0.txt"
    );
    expect(data.state["file_0.txt"][0].version).toEqual(1);
  });
  test("it should be able to delete multiple files without having the whole current object", async () => {
    let object = repository.object({ id: chance.hash() });

    await writeFile(file1, "some content");
    await writeFile(file2, "some content");
    // console.log(object);

    await object.update({ source });

    await object.update({ removeFiles: ["file1.txt", "sample/file_0.txt"] });
    let data = await object.getLatestVersion();

    expect(data.version).toEqual("v2");
    expect(Object.keys(data.state).sort()).toEqual(["file2.txt"]);
    expect(data.state["file2.txt"][0].path).toEqual("v1/content/file2.txt");
    expect(data.state["file2.txt"][0].version).toEqual(1);
  });
});

describe("Testing object manipulation functionality - object with three versions", () => {
  const sourceData = "./test-data/simple-ocfl-object";

  const base = path.join(__dirname, "..", "filesystem-repo-ocfl4");
  const ocflRoot = path.join(base, chance.word());
  const ocflScratch = path.join(base, chance.word());

  let repository, source, object;

  beforeAll(async () => {
    await ensureDir(ocflRoot);
    await ensureDir(ocflScratch);
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
    object = repository.object({ id: chance.hash() });

    source = path.join(ocflScratch, chance.word());
    await copy(sourceData, source);

    // v1
    await object.update({ source });

    // v2 add a file
    await writeFile(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v3 add another file
    await writeFile(path.join(source, "file2.txt"), "fsf v$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    await object.load();
  });
  afterAll(async () => {
    await remove(base);
  });

  test("should be able to get the latest inventory", async () => {
    // v1 create object and import folder
    await object.update({ source });
    await object.load();
    const inventory = await object.getLatestInventory();
    expect(inventory.head).toEqual("v3");
  });
  test("should be able to get the v1 inventory", async () => {
    // v1 create object and import folder
    await object.update({ source });
    await object.load();
    const inventory = await object.getInventory({ version: "v1" });
    expect(inventory.head).toEqual("v1");
  });
  test("should be able to get the versions from an object with three versions", async () => {
    let versions = await object.getVersions();
    expect(versions.length).toEqual(3);
    expect(versions.pop().version).toEqual("v3");
  });
  test("should be able to get the v1 state from an object with three versions", async () => {
    let content = await object.getVersion({ version: "v1" });
    expect(content.version).toEqual("v1");
    expect(content.state).toEqual({
      "file_0.txt": [
        {
          name: "file_0.txt",
          path: "v1/content/sample/file_0.txt",
          hash:
            "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99",
          version: 1,
        },
      ],
    });
  });
  test("should be able to get the latest state from an object with one version", async () => {
    let content = await object.getLatestVersion();
    expect(content.version).toEqual("v3");
    expect(content.state).toEqual({
      "file1.txt": [
        {
          name: "file1.txt",
          path: "v2/content/file1.txt",
          hash:
            "de01d675497715d6e139c1182eeb4e9c73cfe25df4f1006a8e75679910c7b897707591bd574f27f21c50a6f624e737284c5271431302afa0bac8b66a342e3617",
          version: 2,
        },
      ],
      "file2.txt": [
        {
          name: "file2.txt",
          path: "v3/content/file2.txt",
          hash:
            "ea832e64995b2a7d64358abe682e9c0abfb015d22278a78ac17cb2d0a0ac2f9dfc02f5fb2e6baf37a77480a5be0b32957d0e9f979a77403ffb70a8dae1e319d8",
          version: 3,
        },
      ],
      "file_0.txt": [
        {
          name: "file_0.txt",
          path: "v1/content/sample/file_0.txt",
          hash:
            "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99",
          version: 1,
        },
      ],
    });
  });
  test("should be able to get all states from an object with one version", async () => {
    let versions = await object.getVersions();

    let content = await object.getAllVersions();
    expect(content.length).toEqual(3);
    const state1 = content.shift();
    expect(state1.version).toEqual("v1");
    expect(state1.state).toEqual({
      "file_0.txt": [
        {
          name: "file_0.txt",
          path: "v1/content/sample/file_0.txt",
          hash:
            "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99",
          version: 1,
        },
      ],
    });

    const state2 = content.shift();
    expect(state2.version).toEqual("v2");
    expect(state2.state).toEqual({
      "file1.txt": [
        {
          name: "file1.txt",
          path: "v2/content/file1.txt",
          hash:
            "de01d675497715d6e139c1182eeb4e9c73cfe25df4f1006a8e75679910c7b897707591bd574f27f21c50a6f624e737284c5271431302afa0bac8b66a342e3617",
          version: 2,
        },
      ],
      "file_0.txt": [
        {
          name: "file_0.txt",
          path: "v1/content/sample/file_0.txt",
          hash:
            "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99",
          version: 1,
        },
      ],
    });
  });
});

describe(`Test two stage update / commit and diff'ing objects`, () => {
  const sourceData = "./test-data/simple-ocfl-object";

  const base = path.join(__dirname, "..", "filesystem-repo-ocfl5");
  const ocflRoot = path.join(base, chance.word());
  const ocflScratch = path.join(base, chance.word());

  let repository, object;

  beforeAll(async () => {
    await ensureDir(ocflRoot);
    await ensureDir(ocflScratch);
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
    object = repository.object({ id: chance.hash() });
  });
  beforeEach(async () => {
    source = path.join(ocflScratch, chance.word());
    await copy(sourceData, source);
  });
  afterEach(async () => {
    await remove(source);
  });
  afterAll(async () => {
    await remove(base);
  });

  test("it should be able to break out of a v1 update and then commit later", async () => {
    const id = chance.hash();
    object = repository.object({ id });

    // v1
    let { inventory } = await object.update({ source, commit: false });
    await object.commit({ inventory });
  });
  test("it should fail gracefully trying to update twice in a multi stage commit", async () => {
    const id = chance.hash();
    object = repository.object({ id });

    // v1
    let { inventory } = await object.update({ source, commit: false });

    // try second update
    try {
      ({ inventory } = await object.update({ source, commit: false }));
    } catch (error) {
      expect(error.message).toBe(
        `This object is already in deposit. If this is a two stage update commit the last changes before updating again.`
      );
    }
    await object.commit({ inventory });

    // try again after commit
    await writeFile(path.join(source, "fileX.txt"), "sfdkghsfgsdfg");
    ({ inventory } = await object.update({ source, commit: false }));
    await object.commit({ inventory });
  });
  test("it should fail trying to diff an object with one version", async () => {
    const id = chance.hash();
    object = repository.object({ id });

    // v1
    let { inventory } = await object.update({ source, commit: false });
    let versions = await object.getVersions();
    versions = {
      next: versions.pop().version,
      previous: versions.pop()?.version,
    };
    try {
      diff = await object.diffVersions(versions);
    } catch (error) {
      expect(error.message).toEqual(
        `previous can only be a version number like 'v1'`
      );
    }
    await object.commit({ inventory });
  });
  test("should be able to return a diff of two versions", async () => {
    object.init({ id: chance.hash() });

    // v1
    await object.update({ source });

    // v2
    await writeFile(path.join(source, "file2.txt"), "stuff");
    await object.update({ source });
    let diff = await object.diffVersions({ previous: "v1", next: "v2" });
    expect(diff).toEqual({
      same: ["v1/content/sample/file_0.txt"],
      previous: [],
      next: ["v2/content/file2.txt"],
    });

    // v3
    await object.update({ removeFiles: ["sample/file_0.txt"] });
    diff = await object.diffVersions({ previous: "v2", next: "v3" });
    expect(diff).toEqual({
      same: ["v2/content/file2.txt"],
      previous: ["v1/content/sample/file_0.txt"],
      next: [],
    });
  });
  test("it should be able to break out of an update and diff two versions", async () => {
    const id = chance.hash();
    object = repository.object({ id });

    // v1
    await object.update({ source });

    // v2 - two stage commit
    await writeFile(path.join(source, "file2.txt"), "stuff");
    let { inventory } = await object.update({
      source,
      commit: false,
    });
    let versions = await object.getVersions();
    versions = {
      next: versions.pop().version,
      previous: versions.pop().version,
    };
    let diff = await object.diffVersions(versions);
    let decide = diff.next.filter(
      (filename) => !filename.match(/repo-metadata/)
    );
    expect(decide.length).toBe(1);
    await object.commit({ inventory });

    // v3 - two stage commit
    await writeFile(path.join(source, "repo-metadata.json"), "other stuff");
    ({ inventory } = await object.update({
      source,
      commit: false,
    }));
    versions = await object.getVersions();
    versions = {
      next: versions.pop().version,
      previous: versions.pop().version,
    };
    diff = await object.diffVersions(versions);
    decide = diff.next.filter((filename) => !filename.match(/repo-metadata/));
    expect(decide.length).toBe(0);
    await object.commit({ inventory });
  });
  test("it should be able to break out of an update and discover files in deposit that are not inventoried", async () => {
    const id = chance.hash();
    object = repository.object({ id });

    // v1
    await object.update({ source });

    // v2 - two stage commit
    await writeFile(path.join(source, "file2.txt"), "stuff");
    let { inventory } = await object.update({
      source,
      commit: false,
    });

    await writeFile(path.join(object.depositPath, "file3.txt"), "stuff");
    try {
      await object.commit({ inventory });
    } catch (error) {
      expect(error.message).toEqual(
        "The object does not verify. Aborting this commit."
      );
    }
    await object.remove();
  });
});

describe(`Test verifying objects`, () => {
  const sourceData = "./test-data/simple-ocfl-object";

  const base = path.join(__dirname, "..", "filesystem-repo-ocfl6");
  const ocflRoot = path.join(base, chance.word());
  const ocflScratch = path.join(base, chance.word());

  let repository, object;

  beforeAll(async () => {
    await ensureDir(ocflRoot);
    await ensureDir(ocflScratch);
    repository = new Repository({ ocflRoot, ocflScratch });
    await repository.create();
    object = repository.object({ id: chance.hash() });

    source = path.join(ocflScratch, chance.word());
    await copy(sourceData, source);
  });
  afterAll(async () => {
    await remove(base);
  });

  test(`a known good object should verify`, async () => {
    object.init({ id: chance.hash() });
    // v1 create object and import folder
    await object.update({ source });

    await object.update({ writer: writeContent });
    let { isValid, errors } = await object.verify();
    expect(isValid).toBe(true);
    expect(errors.length).toBe(0);
  });
  test(`an object with an inventoried file missing should not verify`, async () => {
    object.init({ id: chance.hash() });
    // v1 create object and import folder
    await object.update({ source });

    await object.update({ writer: writeContent });
    let { isValid, errors } = await object.verify();
    expect(isValid).toBe(true);
    expect(errors.length).toBe(0);

    const version = await object.getLatestVersion();
    await remove(
      path.join(object.repositoryPath, version.state["fileX.txt"][0].path)
    );
    ({ isValid, errors } = await object.verify());
    expect(isValid).toBe(false);
    expect(errors).toEqual([
      "'v2/content/dir/fileX.txt' is inventoried but does not exist within the object",
    ]);
  });
  test(`an object with an extra file that is not inventoried should not verify`, async () => {
    object.init({ id: chance.hash() });
    // v1 create object and import folder
    await object.update({ source });

    await writeFile(
      path.join(object.repositoryPath, "v1", "content", "extra-file.txt"),
      "content"
    );
    ({ isValid, errors } = await object.verify());
    console.log(isValid, errors);
    expect(isValid).toBe(false);
    expect(errors).toEqual([
      "The object has a file 'v1/content/extra-file.txt' that is not in the inventory",
    ]);
  });

  async function writeContent({ target }) {
    CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
      "repo-metadata/metadata.json": "{}",
    };
    const files = Object.keys(CONTENT);
    for (const f of files) {
      const d = path.join(target, path.dirname(f));
      await ensureDir(d);
      await writeFile(path.join(target, f), CONTENT[f]);
    }
  }
});
