const { S3, Bucket } = require("../lib/s3");

(async () => {
  const configuration = {
    type: "S3",
    s3: {
      bucket: process.env.AWS_BUCKET_NAME,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.AWS_ENDPOINT,
    },
  };
  const bucket = new Bucket(configuration.s3);
  const maxKeys = 150;

  console.time("key lookup");
  let keys = await getOcflOid({ keys: [], prefix: "OCFL_oid_" });
  console.timeEnd("key lookup");
  console.log(`Found ${keys.length} objects`);

  console.time("key lookup");
  keys = await getOcflNamaste({ keys: [], prefix: "" });
  console.timeEnd("key lookup");
  console.log(`Found ${keys.length} objects`);
  // console.log(keys);
  process.exit();

  async function getOcflNamaste({ token, keys, prefix }) {
    // console.time("lookup");
    let content = await bucket.listObjects({
      prefix,
      maxKeys,
      continuationToken: token,
    });
    // console.timeEnd("lookup");
    keys = [
      ...keys,
      ...content.Contents.filter((c) =>
        c.Key.match(/\/0=ocfl_object_1.0$/)
      ).map((c) => c.Key.replace("0=ocfl_object_1.0", "inventory.json")),
    ];

    if (content.NextContinuationToken)
      return await getOcflNamaste({
        token: content.NextContinuationToken,
        keys,
        prefix,
      });
    return keys;
  }

  async function getOcflOid({ token, keys, prefix }) {
    let content = await bucket.listObjects({
      prefix,
      maxKeys,
      continuationToken: token,
    });
    keys = [
      ...keys,
      ...content.Contents.map(
        (c) => `${c.Key.split("OCFL_oid_")[1]}/inventory.json`
      ),
    ];
    if (content.NextContinuationToken)
      return await getOcflOid({
        token: content.NextContinuationToken,
        keys,
        prefix,
      });

    return keys;
  }
})();
