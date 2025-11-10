#!/bin/bash

# Fix Historical Timestamps in Backtesting Engine
# This script patches the Docker container's backtesting-engine.js to use historical timestamps

echo "🔧 Fixing historical timestamp issue..."

docker exec trading_backtesting bash -c 'cat > /tmp/fix.js << '\''ENDFIX'\''

// Read the file
const fs = require("fs");
const filePath = "/app/backtesting-engine.js";
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

// FIX 4: Replace Date.now() with currentTime in checkExits for holdTime calculation
code = code.replace(
  /const currentTime = Date\.now\(\);\n    const holdTime = \(currentTime - position\.entryTime\) \/ \(1000 \* 60\);/g,
  "const holdTime = (currentTime - position.entryTime) / (1000 * 60);"
);

// FIX 5: Update all closePosition calls in checkExits to pass currentTime
code = code.replace(
  /return this\.closePosition\(position, currentPrice, '\''([^'\'']+)'\''/ , strategy\);/g,
  (match, reason) => `return this.closePosition(position, currentPrice, '\''${reason}'\'', strategy, currentTime);`
);

// FIX 6: Update closePosition call at end of backtest - need to find and fix
// The cleanup section at end needs the final timestamp
const finalBarPattern = /for \(const position of openPositions\) {\s+\/\/ Use final bar'\''s price to close/;
if (finalBarPattern.test(code)) {
  console.log("✅ Found final bar cleanup section");

  // Insert final timestamp extraction before the loop
  code = code.replace(
    /for \(const position of openPositions\) {\s+\/\/ Use final bar'\''s price to close/,
    `const finalTimestamp = stockData[stockData.length - 1]?.timestamp || Date.now();
      for (const position of openPositions) {
        // Use final bar'\''s price to close`
  );

  // Update the closePosition call in cleanup to use finalTimestamp
  code = code.replace(
    /this\.closePosition\(position, exitPrice, '\''backtest_end'\'', strategy\);/g,
    "this.closePosition(position, exitPrice, '\''backtest_end'\'', strategy, finalTimestamp);"
  );
}

// FIX 7: Update the main loop to pass currentTime to checkExits
code = code.replace(
  /this\.checkExits\(position, { stock: currentStockData, options: optionsData }, strategy\);/g,
  "this.checkExits(position, { stock: currentStockData, options: optionsData }, strategy, currentTime);"
);

// Write back
fs.writeFileSync(filePath, code, "utf8");
console.log("✅ File patched successfully!");
console.log("📝 New file length:", code.length);

ENDFIX

node /tmp/fix.js
'

if [ $? -eq 0 ]; then
    echo "✅ Patch applied successfully!"
    echo "🔄 Restarting container to apply changes..."
    docker restart trading_backtesting
    sleep 5
    echo "✅ Container restarted!"
else
    echo "❌ Patch failed!"
    exit 1
fi
