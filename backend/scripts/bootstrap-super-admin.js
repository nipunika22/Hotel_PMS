const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const readline = require("readline");
const fs = require("fs");
const User = require("../models/User");
const AdminBootstrapLock = require("../models/AdminBootstrapLock");
let localMongoServer = null;

async function connectToProjectDatabase() {
  const uri = process.env.MONGO_URI ? process.env.MONGO_URI.trim() : "";
  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      return;
    } catch (error) {
      console.warn("Configured MongoDB is unavailable; attempting the backend's local persistent database.");
    }
  }
  if (process.env.USE_IN_MEMORY_DB === "true") {
    throw new Error("The backend is configured for temporary in-memory data. Configure a persistent database before bootstrapping a Super Admin.");
  }
  const dbPath = path.resolve(__dirname, "../.mongo-data");
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
  const { MongoMemoryServer } = require("mongodb-memory-server");
  try {
    localMongoServer = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: "wiredTiger" } });
    await mongoose.connect(localMongoServer.getUri());
  } catch (error) {
    throw new Error("Could not open the backend's persistent local database. Stop the backend before running this bootstrap and try again.");
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

function askHidden(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    console.warn("This terminal cannot hide password input; use an interactive terminal to continue.");
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;
    readline.emitKeypressEvents(input);
    output.write(question);
    input.setRawMode(true);
    let value = "";
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          input.removeListener("data", onData);
          input.setRawMode(false);
          output.write("\n");
          resolve(null);
          return;
        }
        if (character === "\r" || character === "\n") {
          input.removeListener("data", onData);
          input.setRawMode(false);
          output.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    input.on("data", onData);
    input.resume();
  });
}

async function main() {
  await connectToProjectDatabase();

  if (await User.exists({ role: "super_admin" })) {
    throw new Error("A Super Admin account already exists; bootstrap is one-time only.");
  }

  const lock = await AdminBootstrapLock.collection.updateOne(
    { _id: "initial-super-admin" },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  if (!lock.upsertedCount) throw new Error("Super Admin bootstrap has already been used.");

  let userCreated = false;
  try {
    const name = await ask("Super Admin display name: ");
    const email = (await ask("Super Admin email: ")).toLowerCase();
    const phone = await ask("Phone: ");
    const password = await askHidden("Password (minimum 12 characters): ");
    if (!password || password.length < 12) throw new Error("Password must be at least 12 characters.");
    if (!name || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A name, valid email, and phone are required.");

    const user = await User.create({ name, email, phone, password, role: "super_admin", status: "Active" });
    userCreated = true;
    await AdminBootstrapLock.updateOne({ _id: "initial-super-admin" }, { $set: { createdUser: user._id } });
    console.log(`Super Admin account created for ${user.email}. The password was not displayed.`);
  } finally {
    if (!userCreated) await AdminBootstrapLock.deleteOne({ _id: "initial-super-admin" });
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (localMongoServer) await localMongoServer.stop();
  });
