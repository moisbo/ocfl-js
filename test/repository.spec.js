const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');
const Repository = require('../lib/repository');


function createDirectory(aPath) {
  if (!fs.existsSync(aPath)) {
    fs.mkdirSync(aPath);
  }
}

describe('repository init', function () {

  describe('no dir', function () {
    const repoPath = path.join(process.cwd(), './test-data/ocflX');
    const repository = new Repository(repoPath);
    it('should test directory', async function f() {
      try {
        const init = await repository.initRepo();
      } catch (e) {
        assert.strictEqual(e.code, 'ENOENT')
      }
    })
  });

  describe('no init', function () {
    const repoPath = path.join(process.cwd(), './test-data/notocfl');
    const repository = new Repository(repoPath);
    it('should not initialise directories with files', async function () {
      try {
        const init = await repository.initRepo();
      } catch (e) {
        assert.strictEqual(e.message, 'can\'t initialise a directory here as there are already files');
      }
    });
  });
});

const repositoryPath = path.join(process.cwd(), './test-data/ocfl1');

describe('repository init 2', function () {
  const repository = new Repository(repositoryPath);
  createDirectory(repositoryPath);

  try {
    it('should test content root', async function () {
      const init = await repository.initRepo();
      assert.strictEqual(repository.version, '1.0');
    });
    it('should have a namaste', function () {
      assert.strictEqual(repository.path, repositoryPath);
    });
    it('should have a namaste file', function () {
      //create this test path
      assert.strictEqual(fs.existsSync(path.join(repositoryPath, '0=ocfl_1.0')), true);
    });
  } catch (e) {
    assert.notStrictEqual(e, null);
  }

});

after(function () {
  //TODO: destroy test repoPath
  fs.removeSync(repositoryPath);
});
