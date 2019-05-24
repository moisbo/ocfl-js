const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');
const Repository = require('../lib/repository');
const OcflObject = require('../lib/ocflObject');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-fs'));

const shell = require("shelljs")
function createDirectory(aPath) {
  if (!fs.existsSync(aPath)) {
    fs.mkdirSync(aPath);
  }
}

// Path constants
const repositoryPath = path.join(process.cwd(), './test-data/ocfl1');
const sourcePath1 = path.join(process.cwd(), './test-data/ocfl-object1-source');
const sourcePath1_additional_files = sourcePath1 + "_additional_files";


async function createTestRepo() {
  fs.removeSync(repositoryPath);
  createDirectory(repositoryPath);
  const repository = new Repository();
  const init = await repository.create(repositoryPath);
  return repository;
}

describe('repository intitialisation', function () {

    it('should not initialise previous created or loaded repositories', async function () {
      const repository = await createTestRepo();
      try {
        const init = await repository.create(repositoryPath);
      } catch (e) {
        assert.strictEqual(e.message, 'This repository has already been initialized.');
      }
    });

    it('should not initialise directories with files', async function () {
      const repository = new Repository();

      try {
        const init = await repository.create(".");
      } catch (e) {
        assert.strictEqual(e.message, "can't initialise a repository as there are already files.");
      }
    });


  it('Should not let you load twice', async function () {
    const repository = new Repository();
    try {
      const new_id = await repository.load(repositoryPath);
    }
    catch (e) {
      assert.strictEqual(e.message, 'This repository has already been initialized.');
    }

  });

});

describe('No directory to create a repo in', function () {
  const repoPath = path.join(process.cwd(), './test-data/ocflX');
  const repository = new Repository();
  it('should test directory', async function f() {
    try {
      const init = await repository.create(repoPath);
    } catch (e) {
      assert.strictEqual(e.code, 'ENOENT')
    }

  });

});

describe('Successful repository creation', function () {
  const ocflVersion = "1.0";

  it('should test content root', async function () {
    const repository = await createTestRepo();
    assert.strictEqual(repository.ocflVersion, ocflVersion);
  });

  it('repo path is set', async function () {
    const repository = await createTestRepo();
    assert.strictEqual(repository.path, repositoryPath);
  });

  it('should have a namaste file', async function () {
    const repository = await createTestRepo();
    assert.strictEqual(fs.existsSync(path.join(repositoryPath, '0=ocfl_' + ocflVersion)), true);
  });

  const repository2 = new Repository();
  it('should initialise in a directory with an existing namaste file', async function () {
    const init = await repository2.load(repositoryPath);
    assert.strictEqual(repository2.ocflVersion, ocflVersion)
  });

});

describe('Adding objects', function () {
 

  const repeatedFileHash = "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99";
  const file1Hash = "4dff4ea340f0a823f15d3f4f01ab62eae0e5da579ccb851f8db9dfe84c58b2b37b89903a740e1ee172da793a6e79d560e5f7f9bd058a12a280433ed6fa46510a";
  const sepiaPicHash = "577b1610764f4d9d05e82b5efe9b39214806e4c29249b59634699101a2a4679317388e78f7b40134aba8371cc684a9b422a7032d34a6785201051e484805bd59";
  const sepiaPicPath = "v1/content/sample/pics/sepia_fence.jpg"
  const sepiaPicLogicalPath = "sample/pics/sepia_fence.jpg"


  it('should make up an ID if you add content', async function () {
    const repository = await createTestRepo();
    const obj = await repository.importNewObject(sourcePath1);
    const inv = await (obj.getInventory());
    const new_id = inv.id;
    // We got a UUID as an an ID
    assert.strictEqual(new_id.length, 36);
    // Check  that the object is there
    const objectPath = path.join(repositoryPath, new_id.replace(/(..)/g, "$1/"));
    assert.strictEqual(fs.existsSync(objectPath), true);
  });

  it('should use your id for a new object if you give it one', async function () {
    const repository = await createTestRepo();
    const obj = await repository.importNewObject(sourcePath1, "some_other_id");
    // We got a UUID as an an ID
    const inv = await (obj.getInventory());
    assert.strictEqual(inv.id, "some_other_id");
    // Check  that the object is there
    const objectPath = path.join(repositoryPath, inv.id.replace(/(..)/g, "$1/"));
    assert.strictEqual(fs.existsSync(objectPath), true);
  });


  it('should refuse to make an object if there is a failed attempt in the deposit dir', async function () {
    const repository = await createTestRepo();
    try {
      const depositDir = await fs.mkdirp(path.join(repositoryPath, "deposit", "some_id"));
      const new_id = await repository.importNewObject(sourcePath1, "some_id");
    }
    catch (e) {
      assert.strictEqual(e.message, 'There is already an object with this ID being deposited or left behind after a crash. Cannot proceed.');
    }

  });

  it('Should now have three objects in it', async function () {
    const repository = await createTestRepo();
    const obj1 = await repository.importNewObject(sourcePath1, "1");
    const obj2 = await repository.importNewObject(sourcePath1, "2");
    const obj3 = await repository.importNewObject(sourcePath1, "3");

    const objects = await repository.objects();
    assert.strictEqual(objects.length, 3)

    //TODO - Check Object IDs

  });


  it('should handle file additions and export', async function () {
    // TODO this depends on tests above running - fix that!
   
    const repository = new Repository();
    const i = repository.load(repositoryPath);

    fs.removeSync(sourcePath1_additional_files);
    shell.cp("-R", sourcePath1, sourcePath1_additional_files);
    // Add some identical additional files

    // Add some new additional files
    fs.writeFileSync(path.join(sourcePath1_additional_files, "sample", "file1.txt"), "$T)(*SKGJKVJS DFKJs");
    fs.writeFileSync(path.join(sourcePath1_additional_files, "sample", "file2.txt"), "$T)(*SKGJKdfsfVJS DFKJs");

    const test_id = "id";
    const id = await repository.importNewObject(sourcePath1, test_id);
    const obj = await repository.importNewObject(sourcePath1_additional_files, test_id);



    const inv3 = await obj.getInventory();
    const new_id = inv3.id;
    assert.strictEqual(new_id, test_id);
    // Check  that the object is there
    const objectPath = path.join(repositoryPath, new_id.replace(/(..)/g, "$1/"));
    assert.strictEqual(fs.existsSync(objectPath), true);
    // Check that it's v2
    const object = new OcflObject();
    const o = await object.load(objectPath);
    const inv = await object.getInventory();

    assert.strictEqual(inv.versions["v2"].state[repeatedFileHash].length, 4);
    assert.strictEqual(inv.versions["v2"].state[repeatedFileHash].indexOf("sample/lots_of_little_files/file_0-copy1.txt") > -1, true);

    // Now delete some stuff 
    const rm = await fs.remove(path.join(sourcePath1_additional_files, "sample", "pics"));
    const new_id1 = await repository.importNewObject(sourcePath1_additional_files, test_id);

    // Re-initialize exsiting object
    const inv1 = await object.getInventory();
    assert.strictEqual(Object.keys(inv1.manifest).length, 211);
    assert.strictEqual(inv1.manifest[sepiaPicHash][0], sepiaPicPath);
    // Sepia pic is v2
    assert.strictEqual(inv1.versions["v2"].state[sepiaPicHash][0], sepiaPicLogicalPath);
    // Not in v3
    assert.strictEqual(inv1.versions["v3"].state[sepiaPicHash], undefined);

    // Now put some stuff back
    shell.cp("-R", path.join(sourcePath1, "sample", "pics"), path.join(sourcePath1_additional_files, "sample"));
    const new_id2 = await repository.importNewObject(sourcePath1_additional_files, test_id);
    const inv2 = await object.getInventory();
    assert.strictEqual(Object.keys(inv1.manifest).length, 211);
    assert.strictEqual(inv2.manifest[sepiaPicHash][0], sepiaPicPath);
    // Sepia pic is v2
    assert.strictEqual(inv2.versions["v4"].state[sepiaPicHash][0], sepiaPicLogicalPath, "no sepia pic in v4");
    // Not in v3
    assert.strictEqual(inv2.versions["v3"].state[sepiaPicHash], undefined, "No sepia pic in v3");
    // No content dirs in V3 or v4
    assert.strictEqual(fs.existsSync(path.join(object.path, "v3", "content")), false), "v3 has no content dir";
    assert.strictEqual(fs.existsSync(path.join(object.path, "v4", "content")), false, "v4 has no content dir");
    // Tho v2 has one
    assert.strictEqual(fs.existsSync(path.join(object.path, "v2", "content")), true, "v2 has content dir");

    const exportDirV4 = path.join("test-data", "exportv4");
    const exportDirV5 = path.join("test-data", "exportv5");
    const exportDirV1 = path.join("test-data", "exportv1");

    const rmf1 = await fs.remove(exportDirV1);
    const rmf4 = await fs.remove(exportDirV4);
    const rmf5 = await fs.remove(exportDirV5);


    const testId = "id";

    try {
      const init = await repository.export(testId, exportDirV4);
    } catch (e) {
      assert.strictEqual(e.message, "Can't export as the directory does not exist.", "Export needs an empty directory to put stuff in.");
    }

    const fl = await fs.writeFile(exportDirV4, "");
    try {
      const init = await repository.export(testId, exportDirV4);
    } catch (e) {
      assert.strictEqual(e.message, "Can't export to an existing file.", "Cannot export over the top of a file");
    }
    const rmf4a = await fs.remove(exportDirV4);

    const new41 = await fs.mkdir(exportDirV4);
    const xp4 = await repository.export(testId, exportDirV4);

    expect(exportDirV4).to.be.a.directory().and.deep.equal(sourcePath1_additional_files, "Matches the stuff that was imported", "Exported v4 is the same as the thing we imported.");


    try {
      const init = await repository.export(testId, exportDirV4);
    } catch (e) {
      assert.strictEqual(e.message, "Can't export as the directory has stuff in it.", "Will not export to a directory that has existing content.");
    }

    const new1 = await fs.mkdir(exportDirV1);
    const xp1 = await repository.export(testId, exportDirV1, { version: "v1" });
    expect(exportDirV1).to.be.a.directory().and.deep.equal(sourcePath1, "Matches the stuff that was imported");

    const new5 = await fs.mkdir(exportDirV5);

    try {
      const init = await repository.export(testId, exportDirV5, { version: "v5" });
    } catch (e) {
      assert.strictEqual(e.message, "Can't export a version that doesn't exist.", "Refuses to export non existent version");
    }
  });

});



after(function () {
  //TODO: destroy test repoPath

});
