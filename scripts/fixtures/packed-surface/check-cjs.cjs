const engram = require("@sentropic/engram");

const expected = [
  "validateExtraction",
  "buildFromJson",
  "cluster",
  "godNodes",
  "generateReport",
  "toJson",
  "buildStaticStudio",
];
for (const name of expected) {
  if (typeof engram[name] !== "function") {
    throw new Error(`Missing root export: ${name}`);
  }
}

try {
  require("@sentropic/engram/llm-mesh");
  throw new Error("CommonJS mesh subpath unexpectedly resolved");
} catch (error) {
  if (error && error.message === "CommonJS mesh subpath unexpectedly resolved") throw error;
  if (!error || error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
    throw new Error(
      `Expected ERR_PACKAGE_PATH_NOT_EXPORTED for CommonJS mesh subpath, received ${String(error && error.code)}`,
      { cause: error },
    );
  }
}

console.log("CommonJS root exports and mesh subpath guard verified");
