const fs = require("fs");
const path = require("path");

const targetPath = "f:\\Proyectos\\Web\\jigsudo\\js\\game-manager.js";
let content = fs.readFileSync(targetPath, "utf8");

// 1. Update clearAllData log
content = content.replace(
  /async clearAllData\(autoReinit = true\) \{\s+console\.warn\("\[GameManager\] Wiping all local data!"\);/g,
  `async clearAllData(autoReinit = true) {
    const activeUid = localStorage.getItem("jigsudo_active_uid");
    const reason = autoReinit ? "Manual Logout" : "Auth Context Switch (Login)";
    console.warn(\`[GameManager] Wiping local data! Context: \${reason}, Previous UID: \${activeUid}\`);`,
);

// 2. Update handleCloudSync log
content = content.replace(
  /async handleCloudSync\(remoteProgress, remoteStats\) \{/g,
  `async handleCloudSync(remoteProgress, remoteStats) {
    console.log("[Sync] handleCloudSync triggered", { hasRemoteProgress: !!remoteProgress, hasRemoteStats: !!remoteStats, localState: !!this.state });`,
);

// 3. Update stats sync log
content = content.replace(
  /console\.log\("\[GM\] Syncing Global Stats from cloud:", remoteStats\);/g,
  `console.log("[Sync] Applying Global Stats from cloud:", remoteStats);`,
);

// 4. Update seed mismatch log
content = content.replace(
  /console\.warn\("\[Sync\] Cloud progress seed mismatch\. Ignoring\."\);/g,
  `console.warn(\`[Sync] Seed mismatch (Cloud: \${hydratedProgress.meta.seed}, Local: \${this.currentSeed}). Stats synced but progress ignored.\`);`,
);

fs.writeFileSync(targetPath, content, "utf8");
console.log("Successfully updated game-manager.js");
直线;
