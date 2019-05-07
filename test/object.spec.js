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
        assert.strictEqual(e.message, 'can\'t initialise a directory here as there are already files');
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
      assert.strictEqual(object.ocflVersion, '0.1');
    });
    it('should have a path', function () {
      assert.strictEqual(object.path, objectPath);
    });
    it('should have a namaste file', function () {
      assert.strictEqual(fs.existsSync(path.join(objectPath, '0=ocfl_object_0.1')), true);
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

describe('object with content', function () {
  const object = new OcflObject(objectPath1);
  const inventoryPath1 = path.join(objectPath1, 'inventory.json');
  const inventoryPath1_v1 = path.join(objectPath1, 'v1', 'inventory.json');

  const id = "some_id";
  createDirectory(objectPath1);

  try {
    it('should test content root', async function () {
      const init = await object.initWithContentFromDir("some_id", sourcePath1);
      assert.strictEqual(object.ocflVersion, '0.1');
    });
    it('should have a namaste', function () {
      assert.strictEqual(object.path, objectPath1);
    });
    it('should have a namaste file', function () {
      //create this test path
      assert.strictEqual(fs.existsSync(path.join(objectPath1, '0=ocfl_object_0.1')), true);
    });
    it('should have a v1 dir', function () {
        //create this test path
        assert.strictEqual(fs.existsSync(path.join(objectPath1, 'v1')), true);
      });
      it('should have a v1/content dir', function () {
        //create this test path
        assert.strictEqual(fs.existsSync(path.join(objectPath1, 'v1', 'content')), true);
      });

      it('should have a manifest (inventory)', function () {
        //create this test path
        assert.strictEqual(fs.existsSync(inventoryPath1), true);
      });

      it('should have a manifest (inventory)', function () {
        //create this test path
        const inv = JSON.parse(fs.readFileSync(inventoryPath1));
        assert.strictEqual(Object.keys(inv.manifest).length, 209);
      });

      
      it('should have an inventory digest file', function () {
        assert.strictEqual(fs.existsSync(inventoryPath1 + '.sha512'), true);
      });
      it('should have a V1 inventory file', function () {
        assert.strictEqual(fs.existsSync(path.join(objectPath1, "v1", "content", 'inventory.json')), true);
      });
      it('should have a V1 inventory digest file', function () {
        assert.strictEqual(fs.existsSync(path.join(objectPath1, "v1", "content", 'inventory.json.sha512')), true);
      });
   
  } catch (e) {
    assert.notStrictEqual(e, null);
  }

});

after(function () {
  //TODO: destroy test repoPath
  fs.removeSync(objectPath);
  //fs.removeSync(objectPath1);
});
