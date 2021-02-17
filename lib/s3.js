// API Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/index.html
// Developer Guide: docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html
const {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const {
  createReadStream,
  createWriteStream,
  readdir,
  ensureDir,
} = require("fs-extra");
const path = require("path");
const hasha = require("hasha");

// https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
const maxFileNameLength = 1024;

class S3 {
  constructor() {
    let configuration = {};
    if (process.env.AWS_ENDPOINT) {
      configuration.endpoint = process.env.AWS_ENDPOINT;
    }
    this.client = new S3Client(configuration);
  }

  async listBuckets() {
    const command = new ListBucketsCommand({});
    return await this.client.send(command);
  }

  async bucketExists({ bucket }) {
    const command = new HeadBucketCommand({ Bucket: bucket });
    return await this.client.send(command);
  }

  async stat({ bucket, path }) {
    const params = { Bucket: bucket, Key: path };
    const command = new HeadObjectCommand(params);
    try {
      return await this.client.send(command);
    } catch (error) {
      return false;
    }
  }

  async upload({ bucket, localPath, target, verify = true }) {
    // check that key length is within the limits
    if (target.length > maxFileNameLength) {
      console.error(
        `The target name '${target}' exceeds the max name length allowed by S3. This file can't be uploaded with that name.`
      );
      return;
    }
    let metadata = {};
    if (verify) {
      metadata.md5 = await hasha.fromFile(localPath, {
        algorithm: "md5",
      });
    }
    const fileStream = createReadStream(localPath);
    fileStream.on("error", function (err) {
      console.log("File Error", err);
    });
    const uploadParams = {
      Bucket: bucket,
      Key: target,
      Body: fileStream,
      Metadata: metadata,
    };
    const command = new PutObjectCommand(uploadParams);
    let response = await this.client.send(command);
    if (verify) await this.verify({ bucket, target, localPath });

    return response;
  }

  async download({ bucket, target, localPath, verify = true }) {
    const downloadParams = { Bucket: bucket, Key: target };
    const command = new GetObjectCommand(downloadParams);
    let response = await this.client.send(command);

    const output = path.join(localPath, target);
    await ensureDir(path.dirname(output));

    await new Promise((resolve, reject) => {
      const stream = createWriteStream(output);
      stream.on("close", resolve);
      stream.on("error", (error) => {
        reject(error);
      });
      response.Body.pipe(stream);
    });

    if (verify) await this.verify({ bucket, target, localPath: output });
    return response;
  }

  async verify({ bucket, target, localPath }) {
    const hash = await hasha.fromFile(localPath, {
      algorithm: "md5",
    });
    const stat = await this.stat({ bucket, path: target });
    if (hash !== stat.Metadata.md5) {
      throw new Error(
        `The hash of the file does not match the hash of the object in S3. Something is wrong with the uploaded copy.`
      );
    }
  }

  async listObjects({
    bucket,
    path = undefined,
    startAfter = undefined,
    maxKeys = undefined,
  }) {
    const params = {
      Bucket: bucket,
    };
    if (path) params.Prefix = path;
    if (startAfter) params.StartAfter = startAfter;
    if (maxKeys) params.MaxKeys = maxKeys;
    const command = new ListObjectsV2Command(params);
    return await this.client.send(command);
  }

  async removeObjects({ bucket, keys }) {
    let objs = keys.map((k) => ({ Key: k }));
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objs },
    });
    return await this.client.send(command);
  }

  async syncLocalPathToBucket({ bucket, localPath, targetPath }) {
    let paths = [];
    await walk({ root: localPath, folder: localPath });

    for (let path of paths) {
      if (path.type !== "directory") {
        await this.upload({
          bucket,
          localPath: path.source,
          target: path.target,
        });
      }
    }
    async function walk({ root, folder }) {
      let entries = await readdir(folder, { withFileTypes: true });
      let source, target;
      for (let entry of entries) {
        source = path.join(folder, entry.name);
        target = source.replace(path.join(path.dirname(root), "/"), "");
        paths.push({
          source,
          target,
          type: entry.isDirectory() ? "directory" : "file",
        });
        if (entry.isDirectory()) {
          await walk({ folder: path.join(folder, entry.name), root });
        }
      }
    }
  }
}

module.exports = {
  S3,
};
