const { S3 } = require("./s3");
const { remove } = require("fs-extra");
const path = require("path");
const hasha = require("hasha");

describe("Test S3 actions", () => {
  let s3client;
  beforeAll(() => {
    checkRequiredParamsInEnv();
    s3client = new S3();
  });
  afterAll(async () => {
    await remove(path.join(__dirname, "..", "s3-testing"));
  });
  test("it should be able to list all of a users' buckets in S3", async () => {
    let data = await s3client.listBuckets();
    expect(data["$metadata"].httpStatusCode).toEqual(200);
  });
  test("it should confirm that a given bucket exists", async () => {
    let data = await s3client.bucketExists({
      bucket: process.env.AWS_BUCKET_NAME,
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);
  });
  test("it should fail to find a given bucket", async () => {
    try {
      let data = await s3client.bucketExists({
        bucket: "bucket",
      });
    } catch (error) {
      expect(error.name).toBe("NotFound");
    }
  });
  test("it should be able to upload a file to the bucket root and then remove it", async () => {
    let data = await s3client.upload({
      bucket: process.env.AWS_BUCKET_NAME,
      localPath: path.join(__dirname, "./S3.js"),
      target: "S3.js",
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);
    data = await s3client.listObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      path: "S3.js",
    });
    expect(data.Contents.length).toBe(1);
    expect(data.Contents[0].Key).toBe("S3.js");

    data = await s3client.removeObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      keys: ["S3.js"],
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);
    expect(data.Deleted.length).toBe(1);
    expect(data.Deleted[0].Key).toBe("S3.js");
  });
  test("it should be able to upload a file to a bucket (pseudo) folder and then remove it", async () => {
    let data = await s3client.upload({
      bucket: process.env.AWS_BUCKET_NAME,
      localPath: path.join(__dirname, "./S3.js"),
      target: "folder/S3.js",
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);
    data = await s3client.listObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      path: "folder/S3.js",
    });
    // expect(data.Contents.length).toBe(1);
    expect(data.Contents[0].Key).toBe("folder/S3.js");

    data = await s3client.removeObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      keys: ["folder/S3.js"],
    });
    expect(data.Deleted.length).toBe(1);
    expect(data.Deleted[0].Key).toBe("folder/S3.js");
  });
  test("it should be able to download an object from the bucket root", async () => {
    // test downloading an object at the bucket root
    let data = await s3client.upload({
      bucket: process.env.AWS_BUCKET_NAME,
      localPath: path.join(__dirname, "./S3.js"),
      target: "S3.js",
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);

    data = await s3client.download({
      bucket: process.env.AWS_BUCKET_NAME,
      target: "S3.js",
      localPath: path.join(__dirname, "..", "s3-testing"),
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);

    const originalHash = await hasha.fromFile(path.join(__dirname, "./S3.js"), {
      algorithm: "md5",
    });

    const newHash = await hasha.fromFile(
      path.join(__dirname, "..", "s3-testing", "./S3.js"),
      {
        algorithm: "md5",
      }
    );
    expect(originalHash).toEqual(newHash);
    data = await s3client.removeObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      keys: ["S3.js"],
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);
  });
  test("it should be able to download an object from some nested path and maintain that path locally", async () => {
    //  test downloading an object at a path - ensure we keep the path locally
    let data = await s3client.upload({
      bucket: process.env.AWS_BUCKET_NAME,
      localPath: path.join(__dirname, "./S3.js"),
      target: "/a/b/c/S3.js",
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);

    data = await s3client.download({
      bucket: process.env.AWS_BUCKET_NAME,
      target: "/a/b/c/S3.js",
      localPath: path.join(__dirname, "..", "s3-testing"),
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);
    data = await s3client.removeObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      keys: ["S3.js"],
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);
  });
  test("checking a path exists - stat", async () => {
    let data = await s3client.stat({
      bucket: process.env.AWS_BUCKET_NAME,
      path: "a/b/c",
    });
    expect(data).toBeFalse;

    await s3client.upload({
      bucket: process.env.AWS_BUCKET_NAME,
      localPath: path.join(__dirname, "./S3.js"),
      target: "folder/S3.js",
    });
    data = await s3client.stat({
      bucket: process.env.AWS_BUCKET_NAME,
      path: "folder/S3.js",
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);

    await s3client.removeObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      keys: ["folder/S3.js"],
    });
  });
  test(`sync local path to bucket`, async () => {
    await s3client.syncLocalPathToBucket({
      bucket: process.env.AWS_BUCKET_NAME,
      localPath: path.join(__dirname, "..", "test-data", "simple-ocfl-object"),
    });

    let data = await s3client.stat({
      bucket: process.env.AWS_BUCKET_NAME,
      path: "simple-ocfl-object/sample/file_0.txt",
    });
    expect(data["$metadata"].httpStatusCode).toEqual(200);

    data = await s3client.removeObjects({
      bucket: process.env.AWS_BUCKET_NAME,
      keys: ["simple-ocfl-object/sample/file_0.txt"],
    });
  });
});

function checkRequiredParamsInEnv() {
  if (
    !process.env.AWS_BUCKET_NAME ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    !process.env.AWS_ENDPOINT
  ) {
    throw new Error(
      `required params not found in environment: AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT`
    );
    process.exit();
  }
}
