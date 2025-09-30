/**
 * 飞书API测试脚本
 * 用于验证API配置和网络连接是否正常
 */

// 测试配置 - 请替换为实际的配置
const TEST_CONFIG = {
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
  tableUrl: 'YOUR_TABLE_URL'
};

// 验证飞书表格链接格式
function validateFeishuTableUrl(url) {
  const patterns = [
    /https:\/\/[^.]+\.feishu\.cn\/base\/([a-zA-Z0-9]+)\?table=([a-zA-Z0-9]+)/,
    /https:\/\/[^.]+\.feishu\.cn\/sheets\/([a-zA-Z0-9]+)\?table=([a-zA-Z0-9]+)/,
    /https:\/\/[^.]+\.feishu\.cn\/wiki\/([a-zA-Z0-9]+)\?table=([a-zA-Z0-9]+)/,
    /https:\/\/[^.]+\.feishu\.cn\/base\/([a-zA-Z0-9]+)/,
    /https:\/\/[^.]+\.feishu\.cn\/sheets\/([a-zA-Z0-9]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const appToken = match[1];
      const tableId = match[2] || 'default';
      return { isValid: true, appToken, tableId };
    }
  }

  return { isValid: false };
}

// 获取飞书访问令牌
async function getFeishuAccessToken(appId, appSecret) {
  try {
    console.log('🔄 正在获取飞书访问令牌...');
    
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret
      })
    });

    if (!response.ok) {
      console.error('❌ HTTP请求失败:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('HTTP响应内容:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('📋 飞书API响应:', JSON.stringify(data, null, 2));
    
    if (data.code === 0 && data.tenant_access_token) {
      console.log('✅ 成功获取飞书访问令牌');
      return data.tenant_access_token;
    } else {
      console.error('❌ 获取飞书访问令牌失败:', {
        code: data.code,
        msg: data.msg,
        error: data.error
      });
      return null;
    }
  } catch (error) {
    console.error('❌ 请求飞书访问令牌时出错:', error);
    return null;
  }
}

// 测试多维表格访问
async function testTableAccess(accessToken, appToken) {
  try {
    console.log('🔄 正在测试多维表格访问...');
    
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

    if (!response.ok) {
      console.error('❌ HTTP请求失败:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('HTTP响应内容:', errorText);
      return false;
    }

    const result = await response.json();
    console.log('📋 多维表格元数据响应:', JSON.stringify(result, null, 2));
    
    if (result.code === 0) {
      console.log('✅ 多维表格访问成功');
      console.log('📊 表格信息:', {
        name: result.data?.app?.name,
        revision: result.data?.app?.revision,
        is_advanced: result.data?.app?.is_advanced
      });
      return true;
    } else {
      console.error('❌ 多维表格访问失败:', {
        code: result.code,
        msg: result.msg
      });
      return false;
    }
  } catch (error) {
    console.error('❌ 测试多维表格访问时出错:', error);
    return false;
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 开始飞书API测试...\n');

  // 1. 验证配置
  console.log('1️⃣ 验证配置...');
  if (!TEST_CONFIG.appId || TEST_CONFIG.appId === 'YOUR_APP_ID') {
    console.error('❌ 请在脚本中设置正确的 appId');
    return;
  }
  if (!TEST_CONFIG.appSecret || TEST_CONFIG.appSecret === 'YOUR_APP_SECRET') {
    console.error('❌ 请在脚本中设置正确的 appSecret');
    return;
  }
  if (!TEST_CONFIG.tableUrl || TEST_CONFIG.tableUrl === 'YOUR_TABLE_URL') {
    console.error('❌ 请在脚本中设置正确的 tableUrl');
    return;
  }
  console.log('✅ 配置验证通过\n');

  // 2. 验证表格链接
  console.log('2️⃣ 验证表格链接...');
  const urlValidation = validateFeishuTableUrl(TEST_CONFIG.tableUrl);
  if (!urlValidation.isValid) {
    console.error('❌ 无效的飞书多维表格链接');
    return;
  }
  console.log('✅ 表格链接验证通过');
  console.log('📋 解析结果:', {
    appToken: urlValidation.appToken,
    tableId: urlValidation.tableId
  });
  console.log('');

  // 3. 获取访问令牌
  console.log('3️⃣ 获取访问令牌...');
  const accessToken = await getFeishuAccessToken(TEST_CONFIG.appId, TEST_CONFIG.appSecret);
  if (!accessToken) {
    console.error('❌ 无法获取访问令牌，请检查 App ID 和 App Secret');
    return;
  }
  console.log('');

  // 4. 测试表格访问
  console.log('4️⃣ 测试表格访问...');
  const tableAccessSuccess = await testTableAccess(accessToken, urlValidation.appToken);
  if (!tableAccessSuccess) {
    console.error('❌ 无法访问多维表格，请检查表格权限设置');
    return;
  }
  console.log('');

  console.log('🎉 所有测试通过！飞书API配置正确。');
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试过程中发生错误:', error);
});