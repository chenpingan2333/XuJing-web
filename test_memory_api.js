const fetch = require('node-fetch');

async function testMemoryAPI() {
  const apiUrl = process.env.PLATFORM_API_URL || 'https://api.deepseek.com';
  const apiKey = process.env.PLATFORM_API_KEY || '';
  
  if (!apiKey) {
    console.log('❌ PLATFORM_API_KEY 未设置');
    return;
  }
  
  console.log('🔍 测试 API 连接...');
  console.log('API URL:', apiUrl);
  console.log('API Key 前几位:', apiKey.substring(0, 10) + '...');
  
  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: '你好' }
        ],
        max_tokens: 10
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API 连接成功');
      console.log('响应状态:', response.status);
    } else {
      console.log('❌ API 连接失败');
      console.log('状态码:', response.status);
      console.log('错误信息:', await response.text());
    }
  } catch (error) {
    console.log('❌ API 调用异常:', error.message);
  }
}

testMemoryAPI();
