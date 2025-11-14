#!/usr/bin/env node

console.log('📋 Claude State Detection Guide\n');

console.log('🎯 CLEAR STATE DISTINCTIONS IN CLAUDE TERMINAL:');
console.log('');

console.log('1. 🚨 SESSION LIMIT HIT (Hard Limit):');
console.log('   ├─ Triggered by: "Session limit reached ∙ resets 7am"');
console.log('   ├─ Event sent: claude-response with sessionLimit: true');
console.log('   ├─ Claude state: claudeReady = false (NOT READY)');
console.log('   ├─ UI effect: Red session limit warning display');
console.log('   └─ Meaning: Claude CANNOT process more requests');
console.log('');

console.log('2. ✅ CLAUDE READY (Functional):');
console.log('   ├─ Triggered by: Claude startup indicators ("Claude Code", "/workspace")');
console.log('   ├─ Event sent: terminal-output (no special flags)');
console.log('   ├─ Claude state: claudeReady = true (READY)');
console.log('   ├─ UI effect: Terminal ready for input');
console.log('   └─ Meaning: Claude CAN accept and process commands');
console.log('');

console.log('3. ⚠️  USAGE WARNING (Still Functional):');
console.log('   ├─ Triggered by: "Approaching weekly limit", "usage limit"');
console.log('   ├─ Event sent: claude-usage-warning or claude-usage-status');
console.log('   ├─ Claude state: claudeReady = true (STILL READY)');
console.log('   ├─ UI effect: Yellow warning notification');
console.log('   └─ Meaning: Claude still works but approaching limits');
console.log('');

console.log('🔍 LOG PATTERNS TO WATCH FOR:');
console.log('');
console.log('Session Limit:');
console.log('  🚨 =================== SESSION LIMIT HIT ===================');
console.log('  🚨 HARD SESSION LIMIT DETECTED - Claude usage exhausted!');
console.log('  🚨 Claude marked as NOT READY due to session limit');
console.log('');

console.log('Claude Ready:');
console.log('  ✅ ================== CLAUDE READY ==================');
console.log('  ✅ Claude is ready for input on terminal');
console.log('  ✅ This is READY status - Claude can accept new commands');
console.log('');

console.log('Usage Warning:');
console.log('  ⚠️  ============= USAGE WARNING (NOT LIMIT) =============');
console.log('  ⚠️  Claude usage approaching limit - still functional');
console.log('  ⚠️  This is WARNING only - Claude can still process commands');
console.log('');

console.log('📊 FRONTEND EVENT MAPPING:');
console.log('');
console.log('sessionLimit: true  → Show red "Session limit reached" banner');
console.log('claudeReady: true   → Terminal input enabled, ready indicator');
console.log('usage-warning       → Show yellow "Approaching limit" notification');
console.log('usage-status        → Update usage meter/indicator');
console.log('');

console.log('✅ All states are now clearly distinguished with enhanced logging!');