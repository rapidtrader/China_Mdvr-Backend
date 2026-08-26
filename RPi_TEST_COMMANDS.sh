#!/bin/bash
# Commands to run on RPi to verify data flow

echo "=== Test 1: Check if PyQT5 app is running ==="
ps aux | grep python | grep main_pyqt5

echo ""
echo "=== Test 2: Check hmi32_state.json locally ==="
cat ~/hmi4/abcd_latest/data/hmi32_state.json 2>/dev/null || echo "❌ File not found"

echo ""
echo "=== Test 3: Check hmi32_history.json locally ==="
ls -la ~/hmi4/abcd_latest/data/hmi32_history.json 2>/dev/null || echo "❌ File not found"

echo ""
echo "=== Test 4: Fetch latest from backend ==="
curl -s "https://ops.dynacleanindustries.com/api/hmi32/latest?machineId=pi-00de9c0a70" | jq '.data.state'

echo ""
echo "=== Test 5: Fetch recent history ==="
curl -s "https://ops.dynacleanindustries.com/api/hmi32/history?machineId=pi-00de9c0a70&limit=3" | jq '.data[] | {timestamp: .updated_at, state: .state}' | head -20

echo ""
echo "=== Test 6: Check PyQT5 logs for emit_state calls ==="
# Look for recent socket_client debug output
tail -50 ~/.local/share/dynaclean/debug.log 2>/dev/null | grep -i "emit_state\|hmi32\|posted" || echo "No logs found"
