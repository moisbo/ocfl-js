// a small node library for creating and reading Oxford Common File Layout
// repositories


const fs = require('fs-extra');
const path = require('path');
const hasha = require('hasha');
const _ = require('lodash');

const DIGEST_ALGORITHM = 'sha512';

// hash a file and return the hash
async function hash_file(p) {
	const hash = await hasha.fromFile(p, {algorithm: DIGEST_ALGORITHM})
	return hash;
}

// recurses into directories and returns an object with the digests
// as keys and paths as values

async function digest_dir(dir) {
	var items = {};
	const contents = await fs.readdir(dir);
	items = _.flatten(await Promise.all(contents.map(async (p1) => {
		const p = path.join(dir, p1);
		const stats = await fs.stat(p);
		if( stats.isDirectory() ) {
			return await digest_dir(p);
		} else {
			const h = await hash_file(p);
			return [ p, h ];
		}
	})));
	return items;
}


async function inventory(id, dir) {
	const inv = {
		'id': id,
		'type': 'https://ocfl.io/1.0/spec/#inventory',
		'digestAlgorithm': DIGEST_ALGORITHM,
		'head': 'v1'
	};
	hashpairs = await digest_dir(dir);
	inv['manifest'] = {};
	for( i = 0; i < hashpairs.length; i += 2 ) {
		inv['manifest'][hashpairs[i + 1]] = hashpairs[i];
	}
	return inv
}

async function main(id, dir) {
	const inv = await inventory(id, dir);
	await fs.writeJson(path.join(dir, 'inventory.json'), inv, { spaces: 2});
	console.log(JSON.stringify(inv, null, 2));
}


main('https://i.made.this.up/', './');