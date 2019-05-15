const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');
const OcflObject = require('../lib/object');



function createDirectory(aPath) {
  if (fs.existsSync(aPath)) {
      fs.removeSync(aPath);
  }
  fs.mkdirSync(aPath);
}

describe('object init', function () {

  describe('no dir', function () {
    const repoPath = path.join(process.cwd(), './test-data/ocfl_obj_test');
    const object = new OcflObject(repoPath);
    it('should test directory', async function f() {
      try {
        const init = await object.init();
      } catch (e) {
        assert.strictEqual(e.code, 'ENOENT')
      }
    })
  });

  describe('no init', function () {
    const repoPath = path.join(process.cwd(), './test-data/notocfl');
    const object = new OcflObject(repoPath);
    it('should not initialise directories with files', async function () {
      try {
        const init = await object.init();
      } catch (e) {
        assert.strictEqual(e.message, 'can\'t initialise an object here as there are already files');
      }
    });
  });
});

const objectPath = path.join(process.cwd(), './test-data/ocfl-object');

describe('object init 2', function () {
  const object = new OcflObject(objectPath);
  createDirectory(objectPath);

  try {
    it('should test content root', async function () {
      const init = await object.init();
      assert.strictEqual(object.ocflVersion, '1.0');
    });
    it('should have a path', function () {
      assert.strictEqual(object.path, objectPath);
    });
    it('should have a namaste file', function () {
      assert.strictEqual(fs.existsSync(path.join(objectPath, '0=ocfl_object_1.0')), true);
    });

    it('should be version 0', function () {
        assert.strictEqual(object.contentVersion, null);
      });

    it('Should let you access an existing (on disk) object', async function() {
        const object2 = await new OcflObject(objectPath);
        const init = await object2.init();

    });
   

  } catch (e) {
    console.log(e);
    assert.notStrictEqual(e, null);
  }

});

const objectPath1 = path.join(process.cwd(), './test-data/ocfl-object1');
const sourcePath1 = path.join(process.cwd(), './test-data/ocfl-object1-source');


describe ('version numbering', function() {
    //Helper functions
    const object = new OcflObject(objectPath1);

    it("should know how to increment versions", function() {
        assert.strictEqual("v1", object.getVersionString(1));
        assert.strictEqual("v100", object.getVersionString(100));
    });
    //Can tell what version of content is in a repository
})


describe('object with content', async function () {
  const object = new OcflObject(objectPath1);
  const inventoryPath1 = path.join(objectPath1, 'inventory.json');
  const inventoryPath1_v1 = path.join(objectPath1, 'v1', 'inventory.json');
  const repeatedFileHash = "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99"
  const file1Hash = "4dff4ea340f0a823f15d3f4f01ab62eae0e5da579ccb851f8db9dfe84c58b2b37b89903a740e1ee172da793a6e79d560e5f7f9bd058a12a280433ed6fa46510a"
  const id = "some_id";
  createDirectory(objectPath1);
    it('should test content root', async function () {
      const init = await object.initWithContentFromDir("some_id", sourcePath1);
      assert.strictEqual(object.ocflVersion, '1.0');
    });
    it('should have a namaste', function () {
      assert.strictEqual(object.path, objectPath1);
    });
    it('should have a namaste file', function () {
      //create this test path
      assert.strictEqual(fs.existsSync(path.join(objectPath1, '0=ocfl_object_1.0')), true);
    });
    it('should have a v1 dir', function () {
        //create this test path
        assert.strictEqual(fs.existsSync(path.join(objectPath1, 'v1')), true);
    });

    it('should be version 1', function () {
       assert.strictEqual(object.contentVersion, "v1");
    });

    it('should have a v1/content dir', function () {
    //create this test path
        assert.strictEqual(fs.existsSync(path.join(objectPath1, 'v1', 'content')), true);
    });

    it('should have a manifest (inventory)', function () {
    //create this test path
        assert.strictEqual(fs.existsSync(inventoryPath1), true);
    });


    it('should have a manifest (inventory) with 209 items in it', async function () {
        const inv = await JSON.parse(fs.readFileSync(inventoryPath1));
        assert.strictEqual(Object.keys(inv.manifest).length, 209);
    });

    it('should have file1.txt ', async function() {
        const inv = await JSON.parse(fs.readFileSync(inventoryPath1));
        assert.strictEqual(inv.manifest[file1Hash][0],"v1/content/sample/lots_of_little_files/file_1.txt");
        assert.strictEqual(inv.versions["v1"].state[file1Hash][0], "sample/lots_of_little_files/file_1.txt");
    });
    

    it('should list 1 copies of file with same content in the manifest and 4 in v1', async function() {
        const inv = await JSON.parse(fs.readFileSync(inventoryPath1));
        assert.strictEqual(inv.manifest[repeatedFileHash].length, 1);
        assert.strictEqual(inv.versions["v1"].state[repeatedFileHash].length,4);
    });

    
    it('should have an inventory digest file', function () {
        assert.strictEqual(fs.existsSync(inventoryPath1 + '.sha512'), true);
    });
   
    it('should have a V1 inventory file', function () {
    assert.strictEqual(fs.existsSync(path.join(objectPath1, "v1",  'inventory.json')), true);
    });

    it('should have a V1 inventory digest file', function () {
    assert.strictEqual(fs.existsSync(path.join(objectPath1, "v1",  'inventory.json.sha512')), true);
    }); 
   
  

});

after(function () {
  //TODO: destroy test repoPath
  fs.removeSync(objectPath);
  //fs.removeSync(objectPath1);
});
