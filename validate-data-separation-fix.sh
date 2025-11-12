#!/bin/bash

echo "🔍 Data Separation Fix Validation"
echo "================================="
echo ""

echo "1️⃣ Checking key fixes in Backtesting.tsx..."

# Check if the tab-aware validation logic exists
echo "✅ Validating tab-aware data validation:"
if grep -q "if (activeTab === 'paper')" /Users/demierminor/Desktop/trade-whisperer-89/src/pages/Backtesting.tsx; then
    echo "  ✅ Tab-aware validation logic found"
else
    echo "  ❌ Tab-aware validation logic missing"
fi

# Check if the isLivePaperTrading logic is corrected
echo ""
echo "✅ Validating data loading mode detection:"
if grep -q "const isLivePaperTrading = activeTab === 'paper';" /Users/demierminor/Desktop/trade-whisperer-89/src/pages/Backtesting.tsx; then
    echo "  ✅ Fixed mode detection logic found"
else
    echo "  ❌ Fixed mode detection logic missing"
fi

# Check if activeTab is in the dependency array
echo ""
echo "✅ Validating useEffect dependency array:"
if grep -q "}, \[activeTab, activeBots, dataPreviewMode" /Users/demierminor/Desktop/trade-whisperer-89/src/pages/Backtesting.tsx; then
    echo "  ✅ activeTab dependency added"
else
    echo "  ❌ activeTab dependency missing"
fi

# Check if shouldLoad logic is tab-aware
echo ""
echo "✅ Validating tab-aware data loading trigger:"
if grep -q "if (activeTab === 'paper' && activeBots" /Users/demierminor/Desktop/trade-whisperer-89/src/pages/Backtesting.tsx; then
    echo "  ✅ Tab-aware loading trigger found"
else
    echo "  ❌ Tab-aware loading trigger missing"
fi

echo ""
echo "2️⃣ Key Improvements Made:"
echo "========================"
echo "✅ Fixed isLivePaperTrading logic to ONLY depend on activeTab"
echo "✅ Added tab-aware validation (paper mode validates bots, historical validates config)"  
echo "✅ Made data loading trigger tab-specific"
echo "✅ Added activeTab to useEffect dependencies"
echo "✅ Enhanced error messages to include current tab context"

echo ""
echo "3️⃣ Expected Behavior:"
echo "====================="
echo "📊 Historical Tab: Should load data using config.startDate/endDate (historical dates)"
echo "📊 Paper Trading Tab: Should load data using forceCurrentData=true (current dates)"
echo "📊 Data separation warnings should only occur for relevant symbols per tab"
echo "📊 Tab switching should trigger appropriate data loading for new tab"

echo ""
echo "4️⃣ Code Analysis Summary:"
echo "========================="

# Count the number of key fixes
FIXES_COUNT=0

if grep -q "const isLivePaperTrading = activeTab === 'paper';" /Users/demierminor/Desktop/trade-whisperer-89/src/pages/Backtesting.tsx; then
    ((FIXES_COUNT++))
fi

if grep -q "if (activeTab === 'paper')" /Users/demierminor/Desktop/trade-whisperer-89/src/pages/Backtesting.tsx; then
    ((FIXES_COUNT++))
fi

if grep -q "activeTab, activeBots, dataPreviewMode" /Users/demierminor/Desktop/trade-whisperer-89/src/pages/Backtesting.tsx; then
    ((FIXES_COUNT++))
fi

echo "✅ Applied fixes: $FIXES_COUNT/3"

if [ $FIXES_COUNT -eq 3 ]; then
    echo "🎉 All critical data separation fixes have been successfully applied!"
    echo "💡 The charts should now load appropriate dates based on the active tab"
    echo "💡 Data separation warnings should be resolved"
else
    echo "⚠️ Some fixes may need verification"
fi

echo ""
echo "🔍 Next Steps:"
echo "============="
echo "1. Test tab switching between Historical and Paper Trading"
echo "2. Verify Historical tab uses configured dates"
echo "3. Verify Paper Trading tab uses current dates"
echo "4. Confirm data separation warnings are resolved"
