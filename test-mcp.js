import { spawn } from 'child_process';

const apiKey = process.env.RIOT_API_KEY;
if (!apiKey) {
  console.error('❌ Set RIOT_API_KEY environment variable');
  process.exit(1);
}

const server = spawn('node', [
  'dist/index.js',
  '--apiKey', apiKey,
  '--gameName', 'ThaoK3',
  '--tagLine', 'EUW'
]);

let buffer = '';

server.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        console.log('\n📥 Response:', JSON.stringify(msg, null, 2));
      } catch (e) {
        console.log('Raw:', line);
      }
    }
  }
});

server.stderr.on('data', (data) => {
  console.log('📋 Server:', data.toString().trim());
});

// Wait for server to initialize
setTimeout(() => {
  console.log('\n📤 Sending: tools/list');
  const listTools = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };
  server.stdin.write(JSON.stringify(listTools) + '\n');
}, 2000);

// Test ranked stats
setTimeout(() => {
  console.log('\n📤 Sending: tft_ranked_stats');
  const callTool = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'tft_ranked_stats',
      arguments: {}
    }
  };
  server.stdin.write(JSON.stringify(callTool) + '\n');
}, 3000);

// Test match summary
setTimeout(() => {
  console.log('\n📤 Sending: tft_match_summary');
  const callTool = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'tft_match_summary',
      arguments: { matchId: 'EUW1_7671287805' }
    }
  };
  server.stdin.write(JSON.stringify(callTool) + '\n');
}, 4000);

// Exit after tests
setTimeout(() => {
  console.log('\n✅ Test completed');
  server.kill();
  process.exit(0);
}, 8000);
