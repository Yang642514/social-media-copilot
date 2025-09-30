/**
 * 小红书助手 - 简化版
 */

/**
 * 小红书助手 - 后台脚本
 */

// 笔记数据接口
interface NoteData {
  title: string;
  author: string;
  likes: number;
  comments: number;
  shares: number;
  publishTime: string;
  recommendLevel: 'high' | 'medium' | 'low';
  likeFollowRatio: number;
  followerCount: number;
  noteScore: number;
  images?: string[]; // 图片URL数组
  content?: string; // 笔记内容
}

// 飞书配置接口
interface FeishuConfig {
  appId: string;
  appSecret: string;
  tableUrl: string;
  syncMode: 'append' | 'overwrite' | 'merge';
  uploadFiles: boolean;
  syncFields: {
    title: boolean;
    author: boolean;
    likes: boolean;
    comments: boolean;
    shares: boolean;
    publishTime: boolean;
    recommendLevel: boolean;
    likeFollowRatio: boolean;
    followerCount: boolean;
    noteScore: boolean;
  };
}

export default defineBackground(() => {
  // 设置侧边栏行为，点击工具栏图标时打开
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('设置侧边栏行为失败:', error);
  });
  
  // 监听来自内容脚本的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggleSidebar') {
      // 打开侧边栏 - 添加tab有效性检查
      if (sender.tab?.id && sender.tab?.windowId) {
        // 先检查tab是否仍然有效
        chrome.tabs.get(sender.tab.id).then((tab) => {
          if (tab && tab.windowId) {
            chrome.sidePanel.open({ windowId: tab.windowId }).catch(error => {
              console.error('打开侧边栏失败:', error);
            });
          }
        }).catch(error => {
          console.error('Tab已无效:', error);
          // 尝试获取当前活动窗口
          chrome.windows.getCurrent().then(window => {
            if (window.id) {
              chrome.sidePanel.open({ windowId: window.id }).catch(err => {
                console.error('使用当前窗口打开侧边栏失败:', err);
              });
            }
          });
        });
      } else {
        // 如果没有有效的tab信息，尝试获取当前活动窗口
        chrome.windows.getCurrent().then(window => {
          if (window.id) {
            chrome.sidePanel.open({ windowId: window.id }).catch(error => {
              console.error('使用当前窗口打开侧边栏失败:', error);
            });
          }
        });
      }
    } else if (message.action === 'syncToFeishu') {
      // 处理同步到飞书的请求
      handleFeishuSync(message.data, message.config, sendResponse);
      return true; // 保持消息通道开放以进行异步响应
    } else if (message.action === 'createFeishuTable') {
      // 处理创建飞书多维表格的请求
      handleCreateFeishuTable(message.config, sendResponse);
      return true; // 保持消息通道开放以进行异步响应
    }
  });

  // 验证飞书表格链接
  function validateFeishuTableUrl(url: string): { isValid: boolean; appToken?: string; tableId?: string } {
    // 支持多种飞书表格链接格式
    const patterns = [
      /https:\/\/[^.]+\.feishu\.cn\/base\/([A-Za-z0-9]+).*table=([A-Za-z0-9]+)/,
      /https:\/\/[^.]+\.feishu\.cn\/sheets\/([A-Za-z0-9]+).*table=([A-Za-z0-9]+)/,
      /https:\/\/[^.]+\.feishu\.cn\/base\/([A-Za-z0-9]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const [, appToken, tableId] = match;
        return {
          isValid: true,
          appToken,
          tableId: tableId || 'default' // 如果没有指定table，使用默认值
        };
      }
    }

    return { isValid: false };
  }

  // 处理飞书同步
  async function handleFeishuSync(noteData: NoteData, config: FeishuConfig, sendResponse: (response: any) => void) {
    try {
      // 验证配置
      if (!config || !config.appId || !config.appSecret) {
        sendResponse({ 
          success: false, 
          error: '请先在侧边栏配置飞书应用信息' 
        });
        return;
      }

      // 验证表格链接
      const urlValidation = validateFeishuTableUrl(config.tableUrl);
      if (!urlValidation.isValid) {
        sendResponse({ 
          success: false, 
          error: '无效的飞书多维表格链接，请检查链接格式' 
        });
        return;
      }

      // 获取飞书访问令牌
      const accessToken = await getFeishuAccessToken(config.appId, config.appSecret);
      if (!accessToken) {
        sendResponse({ 
          success: false, 
          error: '获取飞书访问令牌失败，请检查App ID和App Secret' 
        });
        return;
      }

      // 准备同步数据
      const syncData = prepareSyncData(noteData, config.syncFields);

      // 处理文件上传
      if (config.uploadFiles && noteData.images && noteData.images.length > 0) {
        try {
          const uploadedFiles = await uploadFilesToFeishu(accessToken, noteData.images);
          if (uploadedFiles.length > 0) {
            syncData['附件'] = uploadedFiles.join(', ');
          }
        } catch (error) {
          console.warn('文件上传失败:', error);
          // 文件上传失败不影响数据同步
        }
      }

      // 根据同步模式处理数据
      const syncResult = await syncToFeishuTable(
        accessToken, 
        urlValidation.appToken!, 
        urlValidation.tableId!, 
        syncData, 
        config.syncMode
      );
      
      if (syncResult.success) {
        sendResponse({ 
          success: true, 
          message: '数据已成功同步到飞书多维表格' 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: syncResult.error || '同步失败' 
        });
      }
    } catch (error) {
      console.error('飞书同步错误:', error);
      sendResponse({ 
        success: false, 
        error: '同步过程中发生错误：' + (error as Error).message 
      });
    }
  }

  // 获取飞书访问令牌
  async function getFeishuAccessToken(appId: string, appSecret: string): Promise<string | null> {
    try {
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret
        })
      });

      const data = await response.json();
      
      if (data.code === 0) {
        return data.tenant_access_token;
      } else {
        console.error('获取飞书访问令牌失败:', data);
        return null;
      }
    } catch (error) {
      console.error('请求飞书访问令牌时出错:', error);
      return null;
    }
  }

  // 上传文件到飞书
  async function uploadFilesToFeishu(accessToken: string, imageUrls: string[]): Promise<string[]> {
    const uploadedFiles: string[] = [];

    for (const imageUrl of imageUrls) {
      try {
        // 下载图片
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        
        // 创建FormData
        const formData = new FormData();
        formData.append('file', imageBlob, 'image.jpg');
        formData.append('file_type', 'image');

        // 上传到飞书
        const uploadResponse = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });

        const uploadResult = await uploadResponse.json();
        
        if (uploadResult.code === 0) {
          uploadedFiles.push(uploadResult.data.file_token);
        }
      } catch (error) {
        console.warn('上传图片失败:', imageUrl, error);
      }
    }

    return uploadedFiles;
  }

  // 准备同步数据
  function prepareSyncData(noteData: NoteData, syncFields: FeishuConfig['syncFields']): Record<string, any> {
    const data: Record<string, any> = {};

    if (syncFields.title) data['标题'] = noteData.title;
    if (syncFields.author) data['作者'] = noteData.author;
    if (syncFields.likes) data['点赞数'] = noteData.likes;
    if (syncFields.comments) data['评论数'] = noteData.comments;
    if (syncFields.shares) data['分享数'] = noteData.shares;
    if (syncFields.publishTime) data['发布时间'] = noteData.publishTime;
    if (syncFields.recommendLevel) {
      const levelMap = { high: '高', medium: '中', low: '低' };
      data['推荐程度'] = levelMap[noteData.recommendLevel];
    }
    if (syncFields.likeFollowRatio) data['赞粉比'] = noteData.likeFollowRatio;
    if (syncFields.followerCount) data['粉丝量'] = noteData.followerCount;
    if (syncFields.noteScore) data['笔记评分'] = noteData.noteScore;

    // 添加同步时间和唯一标识
    data['同步时间'] = new Date().toLocaleString('zh-CN');
    data['笔记ID'] = noteData.title + '_' + noteData.author; // 用于去重

    return data;
  }

  // 检查记录是否已存在（用于合并模式）
  async function checkRecordExists(
    accessToken: string, 
    appToken: string, 
    tableId: string, 
    noteId: string
  ): Promise<string | null> {
    try {
      const apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            conditions: [{
              field_name: '笔记ID',
              operator: 'is',
              value: [noteId]
            }]
          }
        })
      });

      const result = await response.json();
      
      if (result.code === 0 && result.data.items && result.data.items.length > 0) {
        return result.data.items[0].record_id;
      }
      
      return null;
    } catch (error) {
      console.warn('检查记录是否存在时出错:', error);
      return null;
    }
  }

  // 同步到飞书多维表格
  async function syncToFeishuTable(
    accessToken: string, 
    appToken: string,
    tableId: string,
    data: Record<string, any>,
    syncMode: FeishuConfig['syncMode']
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let apiUrl: string;
      let method: string;
      let body: any;

      switch (syncMode) {
        case 'append':
          // 追加模式：直接添加新记录
          apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
          method = 'POST';
          body = { fields: data };
          break;

        case 'merge':
          // 合并模式：检查是否存在，存在则更新，不存在则添加
          const existingRecordId = await checkRecordExists(accessToken, appToken, tableId, data['笔记ID']);
          
          if (existingRecordId) {
            // 更新现有记录
            apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${existingRecordId}`;
            method = 'PUT';
            body = { fields: data };
          } else {
            // 添加新记录
            apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
            method = 'POST';
            body = { fields: data };
          }
          break;

        case 'overwrite':
          // 覆盖模式：先清空表格，再添加新记录
          // 注意：这是一个危险操作，实际应用中可能需要更谨慎的处理
          await clearTableRecords(accessToken, appToken, tableId);
          apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
          method = 'POST';
          body = { fields: data };
          break;

        default:
          return { success: false, error: '不支持的同步模式' };
      }

      const response = await fetch(apiUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      
      if (result.code === 0) {
        return { success: true };
      } else {
        console.error('飞书API错误:', result);
        return { 
          success: false, 
          error: `飞书API错误: ${result.msg || '未知错误'}` 
        };
      }
    } catch (error) {
      console.error('同步到飞书表格时出错:', error);
      return { 
        success: false, 
        error: '网络请求失败，请检查网络连接' 
      };
    }
  }

  // 清空表格记录（用于覆盖模式）
  async function clearTableRecords(accessToken: string, appToken: string, tableId: string): Promise<void> {
    try {
      // 获取所有记录
      const listUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
      const listResponse = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const listResult = await listResponse.json();
      
      if (listResult.code === 0 && listResult.data.items) {
        // 批量删除记录
        const recordIds = listResult.data.items.map((item: any) => item.record_id);
        
        if (recordIds.length > 0) {
          const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_delete`;
          await fetch(deleteUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              records: recordIds
            })
          });
        }
      }
    } catch (error) {
      console.warn('清空表格记录时出错:', error);
    }
  }

  // 处理创建飞书多维表格
  async function handleCreateFeishuTable(config: { appId: string; appSecret: string }, sendResponse: (response: any) => void) {
    try {
      // 验证配置
      if (!config || !config.appId || !config.appSecret) {
        sendResponse({ 
          success: false, 
          error: '请先填写App ID和App Secret' 
        });
        return;
      }

      // 获取飞书访问令牌
      const accessToken = await getFeishuAccessToken(config.appId, config.appSecret);
      if (!accessToken) {
        sendResponse({ 
          success: false, 
          error: '获取飞书访问令牌失败，请检查App ID和App Secret' 
        });
        return;
      }

      // 创建多维表格应用
      const createAppResponse = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: '小红书笔记数据表',
          folder_token: '' // 可以指定文件夹，留空则创建在根目录
        })
      });

      const createAppResult = await createAppResponse.json();
      
      if (createAppResult.code !== 0) {
        sendResponse({ 
          success: false, 
          error: `创建多维表格应用失败: ${createAppResult.msg || '未知错误'}` 
        });
        return;
      }

      const appToken = createAppResult.data.app.app_token;
      const appUrl = createAppResult.data.app.url;

      // 获取默认表格ID
      const tablesResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const tablesResult = await tablesResponse.json();
      
      if (tablesResult.code !== 0 || !tablesResult.data.items || tablesResult.data.items.length === 0) {
        sendResponse({ 
          success: false, 
          error: '获取表格信息失败' 
        });
        return;
      }

      const tableId = tablesResult.data.items[0].table_id;

      // 创建字段结构
      const fields = [
        { field_name: '笔记ID', field_type: 1 }, // 文本
        { field_name: '标题', field_type: 1 }, // 文本
        { field_name: '作者', field_type: 1 }, // 文本
        { field_name: '点赞数', field_type: 2 }, // 数字
        { field_name: '评论数', field_type: 2 }, // 数字
        { field_name: '分享数', field_type: 2 }, // 数字
        { field_name: '发布时间', field_type: 1 }, // 文本
        { field_name: '推荐程度', field_type: 3 }, // 单选
        { field_name: '赞粉比', field_type: 2 }, // 数字
        { field_name: '粉丝数', field_type: 2 }, // 数字
        { field_name: '笔记评分', field_type: 2 }, // 数字
        { field_name: '内容', field_type: 1 }, // 文本
        { field_name: '标签', field_type: 1 }, // 文本
        { field_name: '图片', field_type: 1 }, // 文本
        { field_name: '同步时间', field_type: 1 } // 文本
      ];

      // 批量创建字段
      for (const field of fields) {
        try {
          await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(field)
          });
        } catch (error) {
          console.warn(`创建字段 ${field.field_name} 失败:`, error);
        }
      }

      // 构建表格链接
      const tableUrl = `${appUrl}?table=${tableId}`;

      sendResponse({ 
        success: true, 
        tableUrl: tableUrl,
        appToken: appToken,
        tableId: tableId,
        message: '多维表格创建成功！' 
      });

    } catch (error) {
      console.error('创建飞书多维表格错误:', error);
      sendResponse({ 
        success: false, 
        error: '创建过程中发生错误：' + (error as Error).message 
      });
    }
  }
});

console.log('小红书助手后台脚本已加载');
