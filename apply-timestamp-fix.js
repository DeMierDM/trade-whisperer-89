// Apply Historical Timestamp Fix to backtesting-engine.js
const fs = require("fs");
const filePath = "/Users/demierminor/Desktop/trade-whisperer-89/docker/backtesting-server/backtesting-engine.js";
let code = fs.readFileSync(filePath, "utf8");

console.log("📝 Original file length:", code.length);

// FIX 1: Update checkExits method signature to accept currentTime
code = code.replace(
  /checkExits\(position, currentData, strategy\)/g,
  "checkExits(position, currentData, strategy, currentTime)"
);

// FIX 2: Update closePosition method signature to accept currentTimestamp
code = code.replace(
  /closePosition\(position, exitPrice, reason, strategy\) {/g,
  "closePosition(position, exitPrice, reason, strategy, currentTimestamp) {"
);

// FIX 3: Replace Date.now() with currentTimestamp in closePosition
code = code.replace(
  /position\.exitTime = Date\.now\(\);/g,
  "position.exitTime = currentTimestamp || Date.now();"
);

// FIX 4: Remove Date.now() from holdTime calculation in checkExits
code = code.replace(
  /const currentTime = Date\.now\(\);\s+const holdTime = \(currentTime - position\.entryTime\) \/ \(1000 \* 60\);/g,
  "const holdTime = (currentTime - position.entryTime) / (1000 * 60);"
);

// FIX 5: Update all closePosition calls in checkExits to pass currentTime
const closePositionPattern = /return this\.closePosition\(position, currentPrice, '([^']+)', strategy\);/g;
code = code.replace(closePositionPattern, (match, reason) => {
  return `return this.closePosition(position, currentPrice, '${reason}', strategy, currentTime);`;
});

// FIX 6: Update main loop to pass currentTime to checkExits
code = code.replace(
  /this\.checkExits\(position, { stock: currentStockData, options: optionsData }, strategy\);/g,
  "this.checkExits(position, { stock: currentStockData, options: optionsData }, strategy, currentTime);"
);

// FIX 7: Fix end-of-backtest cleanup
const finalBarSection = code.match(/for \(const position of openPositions\) {\s+\/\/ Use final bar's price to close/);
if (finalBarSection) {
  console.log("✅ Found final bar cleanup section");
  code = code.replace(
    /for \(const position of openPositions\) {\s+\/\/ Use final bar's price to close/,
    `const finalTimestamp = stockData[stockData.length - 1]?.timestamp || Date.now();
      for (const position of openPositions) {
        // Use final bar's price to close`
  );
  code = code.replace(
    /this\.closePosition\(position, exitPrice, 'backtest_end', strategy\);/g,
    "this.closePosition(position, exitPrice, 'backtest_end', strategy, finalTimestamp);"
  );
}

// Write back
fs.writeFileSync(filePath, code, "utf8");
console.log("✅ File patched successfully!");
console.log("📝 New file length:", code.length);
console.log("\n🔍 Summary of changes:");
console.log("  - Updated checkExits to accept currentTime parameter");
console.log("  - Updated closePosition to accept currentTimestamp parameter");
console.log("  - Replaced Date.now() with historical timestamps");
console.log("  - Updated all method calls to pass timestamps");
