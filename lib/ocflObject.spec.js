const assert = require("assert");
const path = require("path");
const fs = require("fs-extra");
const hasha = require("hasha");
const OcflObject = require("./ocflObject");
// const _ = require("lodash");
const pairtree = require("pairtree");

const DIGEST_ALGORITHM = "sha512";

describe("Testing object creation functionality", () => {
  let object;
  const ocflRoot = "test1-ocflObject-output";
  const id = "1";
  const source = "./test-data/simple-ocfl-object";
  beforeEach(async () => {
    object = new OcflObject({ ocflRoot, id });
  });

  afterEach(async () => {
    await fs.remove(path.join(source, "file1.txt"));
    await fs.remove(path.join(source, "file2.txt"));
    await fs.remove(ocflRoot);
  });
  test("should be able to create an object with one version", async () => {
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
    await fs.mkdirp(path.join(ocflRoot, "deposit", id));
    try {
      await object.update({ source });
    } catch (error) {
      expect(error.message).toEqual(
        "An object with that ID is already in the deposit path."
      );
    }
  });
  test(`should be able to create an object given a path`, async () => {
    const objectPath = "/xx/yy/zz";
    object = new OcflObject({ ocflRoot, objectPath });
    await object.update({ source });
    await object.load();
    const inventory = await object.getLatestInventory();
    expect(inventory.id).toEqual(objectPath);
  });
  test(`should fail to create an object as a child of another`, async () => {
    let objectPath = "/xx/yy";
    object = new OcflObject({ ocflRoot, objectPath });
    await object.update({ source });

    objectPath = "/xx/yy/zz";
    object = new OcflObject({ ocflRoot, objectPath });
    try {
      await object.update({ source });
    } catch (error) {
      expect(error.message).toEqual(
        `This object is a child of an existing object and that's not allowed.`
      );
    }
  });
  test(`should be able to load an object from a path`, async () => {
    const id = "xxyyzz";
    object = new OcflObject({ ocflRoot, id });
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
    await object.update({ source });

    // v2 add a file
    fs.writeFileSync(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
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
    // v1
    let result;
    await object.update({ source });

    // v2 add a file
    fs.writeFileSync(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v3 add another file
    fs.writeFileSync(
      path.join(source, "file2.txt"),
      "fsf v$T)(*SKGJKVJS DFKJs"
    );
    await object.update({ source });

    let inventory = await object.getLatestInventory();
    // console.log(inventory);
    expect(inventory.head).toEqual("v3");
    expect(Object.keys(inventory.versions).length).toEqual(3);
  });
  test("should be able to create an object with four versions by changing an existing file", async () => {
    await object.update({ source });

    // v2 add a file
    fs.writeFileSync(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v3 add another file
    fs.writeFileSync(
      path.join(source, "file2.txt"),
      "fsf v$T)(*SKGJKVJS DFKJs"
    );
    await object.update({ source });

    // v4 change the content of a file
    fs.writeFileSync(
      path.join(source, "file1.txt"),
      "fsf v$T)(*SKGJKVJS DFKJs"
    );
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
    // v1
    await object.update({ source });

    // v2 add a file
    await fs.writeFile(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v3 add another file
    await fs.writeFile(
      path.join(source, "file2.txt"),
      "fsf v$T)(*SKGJKVJS DFKJs"
    );
    await object.update({ source });

    await // v4 change the content of a file
    await fs.writeFile(
      path.join(source, "file1.txt"),
      "fsf v$T)(*SKGJKVJS DFKJs"
    );
    await object.update({ source });

    // v5 remove a file
    await fs.remove(path.join(source, "file2.txt"));
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
    try {
      await object.update({ source, writer: () => {} });
    } catch (error) {
      expect(error.message).toEqual(
        "Specify only one of source or writer - not both."
      );
    }
  });
  test("should object because neither source nor writer is defined", async () => {
    try {
      await object.update({});
    } catch (error) {
      expect(error.message).toEqual(
        "Specify at least one of source or writer."
      );
    }
  });
  test(`should not be able to export - target folder doesn't exist`, async () => {
    // v1 create object and import folder
    await object.update({ source });
    try {
      await object.export({ target: "./notfolder" });
    } catch (error) {
      expect(error.message).toEqual(`Export target folder doesn't exist.`);
    }
  });
  test(`should not be able to export - target folder not empty`, async () => {
    // v1 create object and import folder
    await object.update({ source });
    try {
      await object.export({ target: "./test-data" });
    } catch (error) {
      expect(error.message).toEqual(`Export target folder isn't empty.`);
    }
  });
  test("should be able to export an object with one version - automatically select head", async () => {
    const exportFolder = "./test-export";
    await object.update({ source });
    await fs.mkdirp(exportFolder);
    await object.export({ target: "./test-export" });
    let content = await fs.readdir(exportFolder);
    expect(content).toEqual(["sample"]);
    content = await fs.readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await fs.remove(exportFolder);
  });
  test("should be able to export an object with one version - select v1", async () => {
    const exportFolder = "./test-export";
    await object.update({ source });
    await fs.mkdirp(exportFolder);
    await object.export({ target: "./test-export", version: "v1" });

    let content = await fs.readdir(exportFolder);
    expect(content).toEqual(["sample"]);
    content = await fs.readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await fs.remove(exportFolder);
  });
  test("should be able to export a version from an object with two versions - select v1", async () => {
    const exportFolder = "./test-export";

    // v1
    await object.update({ source });

    // v2 add a file
    fs.writeFileSync(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // export
    await fs.mkdirp(exportFolder);
    await object.export({ target: "./test-export", version: "v1" });

    let content = await fs.readdir(exportFolder);
    expect(content).toEqual(["sample"]);
    content = await fs.readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await fs.remove(exportFolder);
  });
  test("should be able to export a version from an object with two versions - select v2", async () => {
    const exportFolder = "./test-export";

    // v1
    await object.update({ source });

    // v2 add a file
    fs.writeFileSync(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // export
    await fs.mkdirp(exportFolder);
    await object.export({ target: "./test-export", version: "v2" });

    let content = await fs.readdir(exportFolder);
    expect(content).toEqual(["file1.txt", "sample"]);
    content = await fs.readdir(path.join(exportFolder, "sample"));
    expect(content).toEqual(["file_0.txt"]);
    await fs.remove(exportFolder);
  });

  async function writeContent({ target }) {
    const CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
    };
    const files = Object.keys(CONTENT);
    for (const f of files) {
      const d = path.join(target, path.dirname(f));
      await fs.ensureDir(d);
      await fs.writeFile(path.join(target, f), CONTENT[f]);
    }
  }
});

describe("Testing object manipulation functionality - object with one version", () => {
  let object, source;
  const ocflRoot = "test2-ocflObject-output";
  beforeEach(async () => {
    source = "./test-data/simple-ocfl-object";
    object = new OcflObject({ ocflRoot, id: "2" });
  });
  afterEach(async () => {
    await fs.remove(path.join(source, "file1.txt"));
    await fs.remove(path.join(source, "file2.txt"));
    await fs.remove(ocflRoot);
  });
  test("should be able to get the latest inventory", async () => {
    // v1 create object and import folder
    await object.update({ source });
    await object.load();
    const inventory = await object.getLatestInventory();
    expect(inventory.head).toEqual("v1");
  });
  test("should be able to get the v1 inventory", async () => {
    // v1 create object and import folder
    await object.update({ source });
    await object.load();
    const inventory = await object.getInventory({ version: "v1" });
    expect(inventory.head).toEqual("v1");
  });
  test("should be able to get the versions from an object with one version", async () => {
    // v1 create object and import folder
    await object.update({ source });
    await object.load();

    let versions = await object.getVersions();
    expect(versions.length).toEqual(1);
    expect(versions[0].version).toEqual("v1");
  });
  test(`should be able to see if it's an OCFL object`, async () => {
    let isObject = await object.isObject();
    expect(isObject).toBe(false);

    // v1 create object and import folder
    await object.update({ source });

    isObject = await object.isObject();
    expect(isObject).toBe(true);
  });
  test(`should be able to see if it's available`, async () => {
    let isAvailable = await object.isAvailable();
    expect(isAvailable).toBe(true);

    // v1 create object and import folder
    await object.update({ source });

    isAvailable = await object.isAvailable();
    expect(isAvailable).toBe(false);
  });
  test("should be able to get the state from an object with one version", async () => {
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
    // v1 create object and import folder
    await object.update({ source });
    await object.load();

    let version = await object.getLatestVersion();

    let file = version.state["file_0.txt"].pop();
    file = object.resolveFilePath({ filePath: file.path });
    expect(file).toMatch(`${ocflRoot}/2/v1/content/sample/file_0.txt`);
  });
});

describe("Testing object manipulation functionality - object with three versions", () => {
  let object, source;
  const ocflRoot = "test3-ocflObject-output";
  beforeEach(async () => {
    source = "./test-data/simple-ocfl-object";
    object = new OcflObject({ ocflRoot, id: "3" });
    // v1
    await object.update({ source });

    // v2 add a file
    fs.writeFileSync(path.join(source, "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    await object.update({ source });

    // v3 add another file
    fs.writeFileSync(
      path.join(source, "file2.txt"),
      "fsf v$T)(*SKGJKVJS DFKJs"
    );
    await object.update({ source });

    await object.load();
  });
  afterEach(async () => {
    await fs.remove(path.join(source, "file1.txt"));
    await fs.remove(path.join(source, "file2.txt"));
    await fs.remove(ocflRoot);
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

describe(`Test diff'ing an object`, () => {
  let object;
  const ocflRoot = "test4-ocflObject-output";
  const id = "1";
  const source = "./test-data/simple-ocfl-object";
  beforeEach(async () => {
    object = new OcflObject({ ocflRoot, id });
  });

  afterEach(async () => {
    await fs.remove(path.join(source, "file1.txt"));
    await fs.remove(path.join(source, "file2.txt"));
    await fs.remove(ocflRoot);
  });
  test("should be able to return a diff of two versions", async () => {
    let CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
    };
    await object.update({
      writer: writeContent,
    });

    CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
      "repo-metadata/metadata.json": "{}",
    };
    await object.update({
      writer: writeContent,
    });
    let diff = await object.diffVersions({ previous: "v1", next: "v2" });
    expect(diff).toEqual({
      same: ["v1/content/dir/fileX.txt", "v1/content/fileY.txt"],
      previous: [],
      next: ["v2/content/repo-metadata/metadata.json"],
    });

    CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
    };
    await object.update({
      writer: writeContent,
    });
    diff = await object.diffVersions({ previous: "v2", next: "v3" });
    expect(diff).toEqual({
      same: ["v1/content/dir/fileX.txt"],
      previous: [
        "v1/content/fileY.txt",
        "v2/content/repo-metadata/metadata.json",
      ],
      next: [],
    });

    async function writeContent({ target }) {
      const files = Object.keys(CONTENT);
      for (const f of files) {
        const d = path.join(target, path.dirname(f));
        await fs.ensureDir(d);
        await fs.writeFile(path.join(target, f), CONTENT[f]);
      }
    }
  });
  test("it should be able to break out of an update and diff two versions", async () => {
    // create an object with some content
    let CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
    };
    await object.update({
      writer: writeContent,
    });

    // add some new content and break out of versioning
    CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
      "repo-metadata/metadata.json": "{}",
    };
    let { inventory } = await object.update({
      writer: writeContent,
      commit: false,
    });
    await object.load();
    let versions = await object.getVersions();
    versions = {
      next: versions.pop().version,
      previous: versions.pop().version,
    };
    let diff = await object.diffVersions(versions);
    let decide = diff.next.filter(
      (filename) => !filename.match(/repo-metadata/)
    );
    expect(decide.length).toBe(0);
    await object.remove();
    try {
      const content = await fs.readdir(object.depositPath);
    } catch (error) {
      expect(error.message).toMatch(/no such file or directory/);
    }

    // add some new content that should trigger versioning
    CONTENT = {
      "dir/fileX.txt": "Contents of fileX.txt",
      "fileY.txt": "Contents of fileY.txt",
      "repo-metadata/metadata.json": "{}",
      "something-new.txt": "{}",
    };
    ({ inventory } = await object.update({
      writer: writeContent,
      commit: false,
    }));
    await object.load();
    versions = await object.getVersions();
    versions = {
      next: versions.pop().version,
      previous: versions.pop().version,
    };
    diff = await object.diffVersions(versions);
    decide = diff.next.filter((filename) => !filename.match(/repo-metadata/));

    expect(decide.length).toBe(1);
    await object.commit({ inventory });
    try {
      const content = await fs.readdir(object.depositPath);
    } catch (error) {
      expect(error.message).toMatch(/no such file or directory/);
    }
    const content = await fs.readdir(object.repositoryPath);
    expect(content.length).toBe(5);

    async function writeContent({ target }) {
      const files = Object.keys(CONTENT);
      for (const f of files) {
        const d = path.join(target, path.dirname(f));
        await fs.ensureDir(d);
        await fs.writeFile(path.join(target, f), CONTENT[f]);
      }
    }
  });
});

describe(`Test verifying objects`, () => {
  let object;
  const ocflRoot = "test5-ocflObject-output";
  const id = "1";
  const source = "./test-data/simple-ocfl-object";
  beforeEach(async () => {
    object = new OcflObject({ ocflRoot, id });
  });

  afterEach(async () => {
    await fs.remove(ocflRoot);
  });

  test(`a known good object should verify`, async () => {
    // v1 create object and import folder
    await object.update({ source });

    await object.update({ writer: writeContent });
    let { isValid, errors } = await object.verify();
    expect(isValid).toBe(true);
    expect(errors.length).toBe(0);
  });
  test(`an object with an inventoried file missing should not verify`, async () => {
    // v1 create object and import folder
    await object.update({ source });

    await object.update({ writer: writeContent });
    let { isValid, errors } = await object.verify();
    expect(isValid).toBe(true);
    expect(errors.length).toBe(0);

    const version = await object.getLatestVersion();
    await fs.remove(
      path.join(object.repositoryPath, version.state["fileX.txt"][0].path)
    );
    ({ isValid, errors } = await object.verify());
    expect(isValid).toBe(false);
    expect(errors).toEqual([
      "'v2/content/dir/fileX.txt' is inventoried but does not exist within the object",
    ]);
  });
  test(`an object with an extra file that is not inventoried should not verify`, async () => {
    // v1 create object and import folder
    await object.update({ source });

    await object.update({ writer: writeContent });
    let { isValid, errors } = await object.verify();
    expect(isValid).toBe(true);
    expect(errors.length).toBe(0);

    const version = await object.getLatestVersion();
    await fs.ensureFile(
      path.join(object.repositoryPath, "v1", "content", "extra-file.txt")
    );
    ({ isValid, errors } = await object.verify());
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
      await fs.ensureDir(d);
      await fs.writeFile(path.join(target, f), CONTENT[f]);
    }
  }
});
