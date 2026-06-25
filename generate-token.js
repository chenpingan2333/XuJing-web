import { createAccessToken } from './src/server/auth/jwt.js';

// 设置环境变量
process.env.JWT_SECRET = '18b7fbc0bed0dab5f6dc216a5dd9be72e8bbfe5f3c10ed309627b4d557ae8d37';

async function generateToken() {
    try {
        const adminUser = {
            id: '019eac67-1b0d-7b18-997c-7efbad3d32d8',
            role: 'ADMIN'
        };
        
        const token = await createAccessToken(adminUser);
        console.log('Generated JWT Token:');
        console.log(token);
        
        // 同时生成 curl 测试命令
        console.log('\nTest command:');
        console.log(`curl -H "Authorization: Bearer ${token}" "http://localhost:3000/api/admin/users?page=1&limit=50"`);
    } catch (error) {
        console.error('Error generating token:', error);
    }
}

generateToken();