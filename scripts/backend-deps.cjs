const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");

// Keep these in sync with backend/pom.xml. If the local Maven cache is cold,
// the build script downloads the exact jars into backend/.deps so a fresh clone
// can be built without installing Maven or any extra tooling.
const artifacts = [
  ["uk/co/caprica/vlcj/4.12.1", "vlcj-4.12.1.jar"],
  ["uk/co/caprica/vlcj-natives/4.12.0", "vlcj-natives-4.12.0.jar"],
  ["net/java/dev/jna/jna-jpms/5.16.0", "jna-jpms-5.16.0.jar"],
  ["net/java/dev/jna/jna-platform-jpms/5.16.0", "jna-platform-jpms-5.16.0.jar"],
  ["com/fasterxml/jackson/core/jackson-databind/2.22.3", "jackson-databind-2.22.3.jar"],
  ["com/fasterxml/jackson/core/jackson-core/2.22.3", "jackson-core-2.22.3.jar"],
  ["com/fasterxml/jackson/core/jackson-annotations/2.22", "jackson-annotations-2.22.jar"],
  ["net/jthink/jaudiotagger/3.0.1", "jaudiotagger-3.0.1.jar"],
];

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "PotatoplayerSuper/1.0",
          Accept: "application/java-archive,application/octet-stream,*/*",
        },
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
          response.resume();
          const next = new URL(response.headers.location, url).toString();
          download(next, destination).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} while downloading ${url}`));
          return;
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const temp = destination + ".tmp";
        const out = fs.createWriteStream(temp);
        response.pipe(out);
        out.on("finish", () => {
          out.close(() => {
            try {
              if (fs.statSync(temp).size < 1024) throw new Error("Downloaded file is unexpectedly small");
              fs.renameSync(temp, destination);
              resolve(destination);
            } catch (error) {
              fs.rmSync(temp, { force: true });
              reject(error);
            }
          });
        });
        out.on("error", (error) => {
          fs.rmSync(temp, { force: true });
          reject(error);
        });
      },
    );
    request.setTimeout(60_000, () => request.destroy(new Error("Timed out downloading " + url)));
    request.on("error", reject);
  });
}

async function resolveDependencies({ root }) {
  const repos = [
    process.env.MAVEN_REPO_LOCAL,
    path.join(os.homedir(), ".m2", "repository"),
  ].filter(Boolean);
  const vendor = path.join(root, "backend", ".deps");
  const jars = [];
  for (const [directory, filename] of artifacts) {
    let found = null;
    for (const repo of repos) {
      const candidate = path.join(repo, directory, filename);
      if (fs.existsSync(candidate)) {
        found = candidate;
        break;
      }
    }
    if (!found) {
      const candidate = path.join(vendor, filename);
      if (!fs.existsSync(candidate)) {
        console.log(`[backend] fetching ${filename}`);
        await download(`https://repo.maven.apache.org/maven2/${directory}/${filename}`, candidate);
      }
      found = candidate;
    }
    jars.push(found);
  }
  return jars;
}

module.exports = { resolveDependencies, artifacts };
