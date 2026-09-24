// @sentropic/graphify is now a deprecated forwarding shim for @sentropic/engram.
// This keeps `require('@sentropic/graphify')` working by re-exporting Engram.
module.exports = require("@sentropic/engram");
